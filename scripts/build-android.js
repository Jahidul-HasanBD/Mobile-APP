#!/usr/bin/env node
/**
 * One-step Android production build.
 *
 * Chains the steps a release needs, in order:
 *   1. copy the root HTML/JS into www/ (Capacitor's webDir)
 *   2. `cap sync android`, which regenerates the native plugin projects and
 *      android/app/src/main/assets/{capacitor.config,capacitor.plugins}.json
 *      (Gradle cannot configure without these, so this step is not optional)
 *   3. a release Gradle build - minifyEnabled + shrinkResources are already
 *      configured in android/app/build.gradle - producing both an APK and an AAB
 *
 * Usage: npm run build:android
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const androidDir = path.join(rootDir, 'android');
const isWindows = process.platform === 'win32';

function run(command, args, cwd) {
  const printable = [command, ...args].join(' ');
  console.log(`\n> ${printable}  (in ${path.relative(rootDir, cwd) || '.'})`);

  // On Windows npx and gradlew.bat are .cmd shims, which can only be started
  // through cmd.exe (Node refuses to spawn them directly). Going through
  // cmd.exe explicitly instead of using `shell: true` keeps the arguments from
  // being re-parsed by a second shell layer.
  const result = isWindows
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', printable], { cwd, stdio: 'inherit' })
    : spawnSync(command, args, { cwd, stdio: 'inherit' });

  if (result.error) {
    throw new Error(`could not run "${printable}": ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`"${printable}" failed with exit code ${result.status}`);
  }
}

function newestFile(dir, extension) {
  if (!fs.existsSync(dir)) {
    return null;
  }
  const matches = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(extension))
    .map((name) => path.join(dir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return matches.length > 0 ? matches[0] : null;
}

function report(file, label) {
  if (!file) {
    console.log(`   ${label}: not produced`);
    return false;
  }
  const megabytes = (fs.statSync(file).size / 1024 / 1024).toFixed(1);
  console.log(`   ${label}: ${path.relative(rootDir, file)} (${megabytes} MB)`);
  return true;
}

try {
  run('npm', ['run', 'copy-web'], rootDir);
  run('npx', ['cap', 'sync', 'android'], rootDir);

  const gradlew = isWindows ? 'gradlew.bat' : './gradlew';
  run(gradlew, ['assembleRelease', 'bundleRelease'], androidDir);

  console.log('\nProduction build finished.');
  const hasApk = report(newestFile(path.join(androidDir, 'app/build/outputs/apk/release'), '.apk'), 'APK');
  const hasAab = report(newestFile(path.join(androidDir, 'app/build/outputs/bundle/release'), '.aab'), 'AAB');

  if (!fs.existsSync(path.join(androidDir, 'keystore.properties'))) {
    console.log(
      '\nNote: android/keystore.properties is missing, so the release artifacts are\n' +
        'UNSIGNED. Copy android/keystore.properties.example, fill in your keystore\n' +
        'values, and re-run for a signed APK/AAB (Play rejects unsigned uploads).'
    );
  }

  if (!hasApk || !hasAab) {
    console.error('\nGradle reported success but a release artifact is missing.');
    process.exit(1);
  }
} catch (error) {
  console.error(`\nBuild failed: ${error.message}`);
  process.exit(1);
}

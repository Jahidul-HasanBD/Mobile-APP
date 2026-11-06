# Project specific ProGuard/R8 rules.
#
# Capacitor instantiates plugins reflectively from
# assets/capacitor.plugins.json, so the plugin classes (and the annotation
# metadata read at runtime) must survive shrinking. @capacitor/android already
# ships these as consumer rules; they are repeated here so the release build
# keeps working if the library rules ever change.

-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }

# WebView <-> native bridge entry points.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Annotations are inspected reflectively by the Capacitor bridge.
-keepattributes *Annotation*

# Keep crash reports readable.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

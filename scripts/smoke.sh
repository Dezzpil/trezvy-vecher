#!/usr/bin/env bash
# Реальный запуск на эмуляторе: установка, старт, самотест, скриншоты.
set -u
APK=${1:-app/build/outputs/apk/release/app-release.apk}
PKG=ru.orlov.trezvo
OUT=smoke-out; mkdir -p $OUT
shot(){ sleep "${2:-3}"; adb exec-out screencap -p > "$OUT/$1.png"; }
adb install -r "$APK" || exit 1
adb shell pm grant $PKG android.permission.RECORD_AUDIO
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS || true
adb logcat -c
adb shell am start -W -n $PKG/.MainActivity
shot 01-home 6
PID=$(adb shell pidof $PKG | tr -d '\r'); echo "PID=$PID"
[ -n "$PID" ] || { echo "APP NOT RUNNING"; adb logcat -d > $OUT/logcat.txt; exit 1; }
adb shell am start -n $PKG/.MainActivity --ez selftest true
for i in $(seq 1 40); do sleep 2; adb logcat -d -s TrezvoJS:* | grep -q SELFTEST_RESULT && break; done
sleep 2; shot 02-export-chooser 1
adb shell input keyevent 4; sleep 2
adb shell dumpsys notification --noredact > $OUT/notifications.txt
for s in craving evening night tab:history tab:stats tab:settings; do
  adb shell am start -n $PKG/.MainActivity --es screen "$s" >/dev/null; shot "03-${s/:/-}" 4
  adb shell input keyevent 4; sleep 1
done
adb logcat -d -s TrezvoJS:* AndroidRuntime:E > $OUT/logcat.txt
cat $OUT/logcat.txt | grep -E "SELFTEST|JSERROR|FATAL" 
FAIL=0
grep -q "SELFTEST_RESULT OK" $OUT/logcat.txt || { echo "SELFTEST NOT OK"; FAIL=1; }
grep -q "FATAL EXCEPTION" $OUT/logcat.txt && { echo "CRASH"; FAIL=1; }
grep -q "JSERROR" $OUT/logcat.txt && { echo "JS ERROR"; FAIL=1; }
grep -q "Время снять плащ" $OUT/notifications.txt && echo "NOTIFICATION OK" || { echo "NOTIFICATION MISSING"; FAIL=1; }
[ -n "$(adb shell pidof $PKG | tr -d '\r')" ] && echo "STILL RUNNING OK" || { echo "APP DIED"; FAIL=1; }
exit $FAIL

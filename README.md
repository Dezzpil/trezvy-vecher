# Трезвый вечер

Личное Android-приложение для самонаблюдения: отметки тяги (сила, чего хочу, триггеры), чекпоинты дня (утро / день / вечерний перерыв / итог), голосовые заметки, серии дней, советы «прямо на месте», таймер волны тяги, выгрузка ZIP (journal.md + data.json + audio/) для анализа.

Данные хранятся только на телефоне (внутреннее хранилище приложения).

Сборка: `./gradlew assembleRelease` → `app/build/outputs/apk/release/app-release.apk`. Также собирается GitHub Actions (артефакт `trezvy-vecher-apk`).

## Подпись

Ключ подписи в репозиторий не входит. Без ключа release-сборка подписывается debug-ключом.
Чтобы подписать своим ключом (и ставить обновления поверх без потери данных):

```bash
export TREZVO_KEYSTORE=/path/to/trezvo.keystore TREZVO_KS_PASS=... TREZVO_KEY_ALIAS=trezvo
./gradlew assembleRelease
```

Либо положить ключ в `keystore/trezvo.keystore` (папка в .gitignore).

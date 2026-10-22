// Генератор пакета сценариев: исходник — этот файл, результат — app/src/main/assets/content/core-ru.json.
// В будущем пакет будет собираться бэк-офисом; формат тот же.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));

const taxonomy = {
  needs: [
    { key: 'leave_me_alone', label: 'Чтобы от меня отстали' },
    { key: 'switch_off', label: 'Выключить голову' },
    { key: 'novelty', label: 'Чего-нибудь интересного' },
    { key: 'comfort', label: 'Тепла и уюта' },
    { key: 'company', label: 'Немного общения' },
    { key: 'movement', label: 'Подвигаться' },
    { key: 'rest', label: 'Просто передохнуть' }
  ],
  categories: [
    { key: 'adventure', label: 'Маленькое приключение' },
    { key: 'comfort', label: 'Уют' },
    { key: 'interest', label: 'Интерес' },
    { key: 'body', label: 'Тело' },
    { key: 'social', label: 'Люди' },
    { key: 'pause', label: 'Пауза' },
    { key: 'creative', label: 'Творчество' },
    { key: 'alcohol_shift', label: 'Хотя бы одно изменение' }
  ],
  decline_reasons: [
    { key: 'too_hard', label: 'Слишком много сил' },
    { key: 'cant_now', label: 'Не могу сейчас' },
    { key: 'dislike', label: 'Не люблю такое' },
    { key: 'bored', label: 'Уже надоело' },
    { key: 'other', label: 'Просто не то' }
  ],
  tags: [
    { key: 'walking', label: 'прогулки' }, { key: 'photo', label: 'фотографировать' },
    { key: 'reading', label: 'читать' }, { key: 'music', label: 'музыка' },
    { key: 'games', label: 'игры' }, { key: 'cooking', label: 'готовить' },
    { key: 'sport', label: 'физнагрузка' }, { key: 'calls', label: 'звонки' },
    { key: 'writing', label: 'писать' }, { key: 'drawing', label: 'рисовать' },
    { key: 'voice', label: 'говорить вслух' }, { key: 'screen', label: 'экран' },
    { key: 'listening', label: 'слушать' }, { key: 'water', label: 'вода, душ' },
    { key: 'quiet', label: 'тишина' }
  ],
  constraints: [
    { key: 'mobility', label: 'Трудно много двигаться' },
    { key: 'noise', label: 'Дома нельзя шуметь' },
    { key: 'no_camera', label: 'Не хочу пользоваться камерой' }
  ],
  requires: ['can_leave_home', 'close_person']
};

// Короткие помощники для карточек
const STOP2 = 'Не зашло — можно бросить через пару минут.';
const fu = (question, delay_min = 20, ask_craving = true) => ({ question, scale: 'better_same_worse', ask_craving, delay_min });
const S = (o) => ({
  revision: 1, status: 'active', setting: 'home', duration_min: 3, duration_max: 10,
  effort: 1, cost: 0, social: 'solo', novelty: 1, requires: [], excludes_if: [],
  intoxicated_ok: true, fallback_id: null, tags: [], author: 'core', notes: '',
  followup: fu('Удалось немного переключиться?'), ...o
});
const V = (text, extra = {}) => ({ key: 'default', text, stop_permission: STOP2, ...extra });
const LOW = (text, extra = {}) => ({ key: 'low_energy', text, stop_permission: 'Если не идёт — просто остановись.', ...extra });
const SHORT = (text, extra = {}) => ({ key: 'short', text, stop_permission: STOP2, ...extra });

const scenarios = [
  // ---------- adventure ----------
  S({ id: 'three_odd_details', title: 'Три странности', category: 'adventure', needs: ['novelty', 'switch_off'], setting: 'outdoors',
    duration_min: 10, duration_max: 20, effort: 2, novelty: 2, requires: ['can_leave_home'], intoxicated_ok: false,
    fallback_id: 'odd_details_home', tags: ['walking', 'photo'],
    variants: [V('Выйди на короткую прогулку и найди три странные детали. Не красивые — именно странные. Если хочется, сфотографируй.',
      { steps: ['Выйди из дома', 'Ищи то, что выглядит нелепо или неуместно', 'Три штуки — и можно домой'] }),
      SHORT('Дойди до угла дома и обратно. По дороге найди одну странную деталь.', { duration_min: 5 })],
    followup: fu('Нашлось что-нибудь странное? Стало легче, так же или хуже?') }),
  S({ id: 'odd_details_home', title: 'Дом как незнакомое место', category: 'adventure', needs: ['novelty', 'switch_off'],
    duration_min: 3, duration_max: 7, novelty: 2, tags: ['photo'], excludes_if: [],
    variants: [V('Найди дома три детали, которых обычно не замечаешь. Одну сними так близко, чтобы было непонятно, что это.'),
      LOW('Не вставая, найди взглядом три вещи, которые давно не замечал.')] }),
  S({ id: 'faces_in_things', title: 'Лица в вещах', category: 'adventure', needs: ['novelty'], setting: 'any',
    duration_min: 5, duration_max: 15, novelty: 2, tags: ['photo'], excludes_if: ['no_camera'],
    variants: [V('Найди три предмета, которые похожи на лица: розетка, сумка, фасад. Сфотографируй самое недовольное.')] }),
  S({ id: 'other_route', title: 'Другой дорогой', category: 'adventure', needs: ['novelty', 'switch_off'], setting: 'outdoors',
    duration_min: 15, duration_max: 30, effort: 2, novelty: 2, requires: ['can_leave_home'], intoxicated_ok: false,
    excludes_if: ['mobility'], fallback_id: 'sky_watch', tags: ['walking'],
    variants: [V('Пройди привычный маршрут другой дорогой: через двор, где не бывал, или по другой стороне улицы. Цель — не дойти, а посмотреть.')] }),
  S({ id: 'walk_without_phone', title: 'Прогулка без телефона', category: 'adventure', needs: ['leave_me_alone', 'switch_off'], setting: 'outdoors',
    duration_min: 10, duration_max: 25, effort: 2, requires: ['can_leave_home'], intoxicated_ok: false,
    excludes_if: ['mobility'], fallback_id: 'blanket_silence', tags: ['walking', 'quiet'],
    variants: [V('Выйди на 15 минут и оставь телефон дома или в беззвучном режиме в кармане. Никуда не надо, никому не надо отвечать.')] }),
  S({ id: 'sky_watch', title: 'Кусок неба', category: 'pause', needs: ['rest', 'switch_off'], setting: 'any',
    duration_min: 3, duration_max: 5, tags: ['quiet'],
    variants: [V('Найди окно или балкон, откуда видно небо подальше. Три минуты просто смотри, как меняются облака или огни.')] }),

  // ---------- comfort ----------
  S({ id: 'cocoa_new_spot', title: 'Какао в другом месте', category: 'comfort', needs: ['comfort', 'leave_me_alone'],
    duration_min: 10, duration_max: 20, tags: ['cooking'],
    variants: [V('Сделай какао или кофе и устройся там, где обычно не сидишь: на подоконнике, на полу, на балконе.'),
      LOW('Налей себе что-нибудь тёплое и сядь в другом месте. Больше ничего.')],
    followup: fu('Удалось хоть немного согреться и выдохнуть?') }),
  S({ id: 'shower_reset', title: 'Душ-перезагрузка', category: 'comfort', needs: ['comfort', 'switch_off'],
    duration_min: 10, duration_max: 20, tags: ['water'],
    variants: [V('Прими душ и переоденься в чистое и удобное. Как будто день закончился и начинается другой, твой.')] }),
  S({ id: 'blanket_silence', title: 'Плед и тишина', category: 'comfort', needs: ['leave_me_alone', 'rest'],
    duration_min: 10, duration_max: 15, tags: ['quiet'],
    variants: [V('Укройся пледом и 10 минут побудь в тишине. Без телефона, без задач. Можно просто лежать.')] }),
  S({ id: 'simple_tasty', title: 'Что-то вкусное', category: 'comfort', needs: ['comfort'], duration_min: 20, duration_max: 40,
    effort: 2, cost: 1, tags: ['cooking'],
    variants: [V('Приготовь что-нибудь простое и вкусное: яичницу с чем-нибудь неожиданным, гренки, бутерброд «как в детстве».'),
      LOW('Съешь что-нибудь вкусное, что уже есть дома. Сядь за стол, не на ходу.', { duration_min: 5 })] }),
  S({ id: 'slow_tea', title: 'Медленный чай', category: 'comfort', needs: ['comfort', 'switch_off'], duration_min: 7, duration_max: 15,
    tags: ['cooking', 'quiet'],
    variants: [V('Завари чай очень медленно, как будто это важная церемония: чайник, чашка, ожидание. Пей, пока горячий.')] }),
  S({ id: 'comfy_clothes', title: 'Самое удобное', category: 'comfort', needs: ['comfort', 'rest'], duration_min: 2, duration_max: 5,
    variants: [V('Переоденься в самую удобную одежду, какая есть. Рабочий день официально снят.')] }),
  S({ id: 'eat_properly', title: 'Нормально поесть', category: 'comfort', needs: ['comfort', 'rest'], duration_min: 10, duration_max: 30,
    tags: ['cooking'],
    variants: [V('Поешь нормально — горячее, за столом. На голодный и уставший организм вечер всегда кажется хуже.')] }),

  // ---------- interest ----------
  S({ id: 'two_pages', title: 'Две страницы', category: 'interest', needs: ['novelty', 'switch_off'], duration_min: 5, duration_max: 30,
    tags: ['reading'],
    variants: [V('Открой любую книгу, которая есть под рукой. Прочитай две страницы. Найди фразу, с которой хочется поспорить.'),
      LOW('Открой книгу на случайной странице и прочитай один абзац. Этого достаточно.')],
    followup: fu('Зацепило что-нибудь в тексте?') }),
  S({ id: 'short_story', title: 'Один рассказ', category: 'interest', needs: ['novelty', 'leave_me_alone'], duration_min: 10, duration_max: 25,
    tags: ['reading', 'screen'], novelty: 2,
    variants: [V('Прочитай один короткий рассказ на 10 минут — например, Чехова, Зощенко или О. Генри. Не понравится начало — бросай.')] }),
  S({ id: 'one_game_round', title: 'Одна партия', category: 'interest', needs: ['switch_off', 'leave_me_alone'], duration_min: 10, duration_max: 30,
    tags: ['games', 'screen'],
    variants: [V('Сыграй одну партию или один уровень в игру, которая нравится. Одну — без обязательства продолжать.')] }),
  S({ id: 'forgotten_album', title: 'Забытая песня', category: 'interest', needs: ['comfort', 'switch_off'], duration_min: 4, duration_max: 10,
    tags: ['music', 'listening'],
    variants: [V('Включи песню из альбома, который давно не слушал. На эти несколько минут больше ничего не делай. Можно лежать.')] }),
  S({ id: 'chosen_film', title: 'Фильм, который правда хочется', category: 'interest', needs: ['comfort', 'leave_me_alone'],
    duration_min: 40, duration_max: 150, tags: ['screen'],
    variants: [V('Выбери фильм или серию, которые давно хотел посмотреть, — не фоном, а по-настоящему. Устройся удобно.')] }),
  S({ id: 'unknown_topic', title: 'Неизвестная тема', category: 'interest', needs: ['novelty'], duration_min: 15, duration_max: 40,
    tags: ['listening', 'screen'], novelty: 2,
    variants: [V('Включи лекцию или выпуск подкаста о том, о чём ты ничего не знаешь: история, космос, грибы, архитектура.')] }),
  S({ id: 'wiki_rabbit', title: 'Кроличья нора', category: 'interest', needs: ['novelty', 'switch_off'], duration_min: 5, duration_max: 20,
    tags: ['reading', 'screen'], novelty: 2,
    variants: [V('Открой случайную статью Википедии («Случайная статья» в меню). Перейди по трём ссылкам подряд. Куда тебя занесло?')] }),

  // ---------- body ----------
  S({ id: 'warmup_5', title: 'Разминка на 5 минут', category: 'body', needs: ['movement', 'switch_off'], duration_min: 5, duration_max: 10,
    effort: 2, intoxicated_ok: false, excludes_if: ['mobility'], tags: ['sport'],
    variants: [V('Пять минут разминки: шея, плечи, наклоны, вращения. Не тренировка — просто напомнить телу, что оно есть.')] }),
  S({ id: 'ten_reps', title: '10 и 10', category: 'body', needs: ['movement', 'switch_off'], duration_min: 2, duration_max: 5,
    effort: 2, intoxicated_ok: false, excludes_if: ['mobility'], tags: ['sport'],
    variants: [V('10 приседаний и 10 отжиманий — можно от стола или стены. Без рекордов. Просто встряхнуть себя.')] }),
  S({ id: 'window_air', title: 'Открытое окно', category: 'body', needs: ['switch_off', 'rest'], duration_min: 2, duration_max: 5,
    tags: ['quiet'],
    variants: [V('Открой окно и три минуты постой у него. Подыши, послушай улицу.')] }),
  S({ id: 'floor_stretch', title: 'Растяжка лёжа', category: 'body', needs: ['rest', 'movement'], duration_min: 5, duration_max: 15,
    variants: [V('Ляг на пол на коврик или плед. Потянись во все стороны, как кот. Подтяни колени к груди, полежи.')] }),
  S({ id: 'cold_water_face', title: 'Холодная вода', category: 'body', needs: ['switch_off'], duration_min: 1, duration_max: 3,
    tags: ['water'],
    variants: [V('Умой лицо холодной водой. Три раза. Тело быстрее выключает мысли, чем уговоры.')] }),

  // ---------- social ----------
  S({ id: 'send_song', title: 'Песня без отчёта', category: 'social', needs: ['company'], setting: 'any', duration_min: 2, duration_max: 5,
    social: 'with_close', requires: ['close_person'], tags: ['music'],
    variants: [V('Отправь близкому человеку песню или смешную картинку. Не нужно рассказывать, как прошёл день.')] }),
  S({ id: 'call_no_reason', title: 'Звонок без повода', category: 'social', needs: ['company'], setting: 'any', duration_min: 5, duration_max: 15,
    effort: 2, social: 'with_close', requires: ['close_person'], tags: ['calls'],
    variants: [V('Позвони кому-нибудь без повода на пять минут. Можно сказать прямо: «Просто захотелось поговорить».')] }),
  S({ id: 'among_people', title: 'Рядом с людьми', category: 'social', needs: ['company', 'switch_off'], setting: 'outdoors',
    duration_min: 15, duration_max: 30, effort: 2, social: 'among_people', requires: ['can_leave_home'], intoxicated_ok: false,
    fallback_id: 'send_song', tags: ['walking'],
    variants: [V('Выйди туда, где есть люди, но с ними не нужно разговаривать: сквер, двор, улица. Просто побудь рядом.')] }),

  // ---------- pause ----------
  S({ id: 'five_min_nothing', title: 'Пять минут ничьих', category: 'pause', needs: ['leave_me_alone', 'rest'], duration_min: 5, duration_max: 5,
    tags: ['quiet'],
    variants: [V('Пять минут, которыми ты никому не обязан. Не медитация и не саморазвитие. Просто время без задачи.', { stop_permission: 'Тут нельзя сделать неправильно.' })] }),
  S({ id: 'lie_one_track', title: 'Лёжа под один трек', category: 'pause', needs: ['rest', 'switch_off'], duration_min: 3, duration_max: 8,
    tags: ['music', 'listening'],
    variants: [V('Ляг, закрой глаза и послушай одну песню целиком. Только её.')] }),
  S({ id: 'five_sounds', title: 'Пять звуков', category: 'pause', needs: ['switch_off', 'rest'], duration_min: 2, duration_max: 3,
    tags: ['quiet'],
    variants: [V('Закрой глаза и насчитай пять разных звуков вокруг — ближних и дальних.')] }),

  // ---------- creative ----------
  S({ id: 'album_cover', title: 'Обложка альбома', category: 'creative', needs: ['novelty'], setting: 'any', duration_min: 3, duration_max: 10,
    novelty: 2, tags: ['photo'], excludes_if: ['no_camera'],
    variants: [V('Сфотографируй любой предмет так, будто это обложка альбома. Название придумай максимально нелепое.')] }),
  S({ id: 'museum_caption', title: 'Музей сегодняшнего дня', category: 'creative', needs: ['novelty', 'switch_off'], duration_min: 2, duration_max: 5,
    novelty: 2, tags: ['writing'],
    variants: [V('Выбери один предмет сегодняшнего дня и придумай ему музейную подпись. Можно язвительную. «Кружка. Пережила три совещания».')] }),
  S({ id: 'voice_absurd', title: 'Абсурд дня', category: 'creative', needs: ['switch_off', 'leave_me_alone'], duration_min: 2, duration_max: 5,
    tags: ['voice'], action: 'open_voice',
    variants: [V('Расскажи голосом самую абсурдную часть сегодняшнего дня. Разбирать и исправлять ничего не будем.')] }),
  S({ id: 'day_map', title: 'Карта дня', category: 'creative', needs: ['novelty', 'switch_off'], duration_min: 5, duration_max: 10,
    novelty: 2, tags: ['drawing'],
    variants: [V('Нарисуй сегодняшний день как карту: «болото совещаний», «перевал обеда», «гора посуды». Пять минут, кривые линии — нормально.')] }),
  S({ id: 'day_menu', title: 'Меню дня', category: 'creative', needs: ['novelty'], duration_min: 3, duration_max: 7, novelty: 2, tags: ['writing'],
    variants: [V('Составь меню ресторана, где подают твой сегодняшний день. «Салат из недосыпа», «котлета дедлайна». Три блюда.')] }),
  S({ id: 'useless_thing', title: 'Бесполезное дело', category: 'creative', needs: ['novelty', 'leave_me_alone'], duration_min: 5, duration_max: 20,
    novelty: 3, tags: [],
    variants: [V('Сделай одну маленькую вещь, от которой совершенно никакой пользы: построй башню из книг, переставь предметы на полке по цвету.')] }),

  // ---------- alcohol_shift (ветка «всё равно выпью») ----------
  S({ id: 'shift_no_background', title: 'Без фонового видео', category: 'alcohol_shift', needs: ['switch_off', 'comfort'],
    duration_min: 1, duration_max: 120, tags: [],
    variants: [V('Сегодня без привычного фонового видео. Выбери одну вещь — альбом, фильм или игру, — которую действительно хочется.')],
    followup: fu('Вечер хоть чем-то отличается от вчерашнего?', 40, false) }),
  S({ id: 'shift_conscious_music', title: 'Музыка по выбору', category: 'alcohol_shift', needs: ['comfort'], duration_min: 1, duration_max: 60,
    tags: ['music'],
    variants: [V('Выбери музыку сознательно: один альбом целиком, который правда хочется услышать, а не случайный поток.')],
    followup: fu('Вечер хоть чем-то отличается от вчерашнего?', 40, false) }),
  S({ id: 'shift_other_spot', title: 'Другое место', category: 'alcohol_shift', needs: ['novelty'], duration_min: 1, duration_max: 60,
    variants: [V('Сядь в другом месте квартиры — не там, где обычно. Просто посмотри, отличается ли вечер.')],
    followup: fu('Вечер хоть чем-то отличается от вчерашнего?', 40, false) }),
  S({ id: 'shift_decide_amount', title: 'Решить заранее', category: 'alcohol_shift', needs: ['rest'], duration_min: 1, duration_max: 5,
    variants: [V('Реши заранее, сколько будет сегодня, и достань только это. Остальное пусть останется в холодильнике.')],
    followup: fu('Получилось остаться в том количестве, что решил?', 60, false) }),
  S({ id: 'shift_water_between', title: 'Вода между', category: 'alcohol_shift', needs: ['rest'], duration_min: 1, duration_max: 5,
    tags: ['water'],
    variants: [V('Поставь рядом большой стакан воды. Между банками — стакан воды.')],
    followup: fu('Получилось чередовать?', 60, false) }),
  S({ id: 'shift_eat_first', title: 'Сначала поесть', category: 'alcohol_shift', needs: ['comfort'], duration_min: 10, duration_max: 30,
    tags: ['cooking'],
    variants: [V('Сначала нормально поешь — горячее, за столом. Всё остальное потом.')],
    followup: fu('Получилось сначала поесть?', 40, false) })
];

// ---------- Сценарии разговора ----------
const Q_NEED = (next) => ({ id: 'q_need', type: 'question', text: 'Чего тебе будет не хватать вечером?', skip_if: { 'ctx.need': '*' },
  options: [
    { key: 'leave_me_alone', label: 'Чтобы от меня отстали', sets: { need: 'leave_me_alone' }, next },
    { key: 'switch_off', label: 'Выключить голову', sets: { need: 'switch_off' }, next },
    { key: 'novelty', label: 'Чего-нибудь интересного', sets: { need: 'novelty' }, next },
    { key: 'comfort', label: 'Тепла и уюта', sets: { need: 'comfort' }, next },
    { key: 'company', label: 'Немного общения', sets: { need: 'company' }, next },
    { key: 'movement', label: 'Подвигаться', sets: { need: 'movement' }, next },
    { key: 'rest', label: 'Не знаю, всё достало', sets: { need: 'rest', energy: 1 }, next }
  ], skip_next: next });
const Q_ENERGY = (next) => ({ id: 'q_energy', type: 'question', text: 'Сколько сил будет на что-то новое?', skip_if: { 'ctx.energy': '*' },
  options: [
    { key: 'low', label: 'Только совсем простое', sets: { energy: 1, time: 10 }, next },
    { key: 'mid', label: 'Минут на 15–20 хватит', sets: { energy: 2, time: 20 }, next },
    { key: 'high', label: 'Можно выбраться или чем-то заняться', sets: { energy: 3, time: 60 }, next }
  ], skip_next: next });
const Q_SETTING = (next) => ({ id: 'q_setting', type: 'question', text: 'Получится выйти из дома?',
  skip_if: { 'profile.can_leave_home_evening': 'no', 'ctx.intoxicated': true }, skip_sets: { setting: 'home' }, skip_next: next,
  options: [
    { key: 'yes', label: 'Да', sets: { setting: 'any' }, next },
    { key: 'no', label: 'Нет, я дома', sets: { setting: 'home' }, next },
    { key: 'unsure', label: 'Не уверен', sets: { setting: 'home' }, next }
  ] });
const I_DO = { id: 'i_do', type: 'instruction', on: { done: 'f_fb', later: 'e_later' } };
const F_FB = { id: 'f_fb', type: 'feedback', on: { done: 'e_thanks' } };
const E_COMMON = [
  { id: 'e_thanks', type: 'end', text: 'Спасибо. Это помогает подбирать точнее.' },
  { id: 'e_later', type: 'end', text: 'Хорошо. Спрошу, как прошло, чуть позже.' }
];

const flows = [
  { id: 'day_plan', revision: 1, trigger: 'day_plan', title: 'План вечера', entry_node: 'q_need', nodes: [
    { ...Q_NEED('q_energy'), text: 'Как хочется провести сегодняшний вечер? Чего тебе будет не хватать?' },
    Q_ENERGY('q_setting'), Q_SETTING('o_main'),
    { id: 'o_main', type: 'offer', text: 'Вот две идеи на вечер. Можно сделать сейчас или запланировать.',
      offer: { count: 2, diversity: 'category', allow_plan: true, allow_now: true, max_declines: 4 },
      on: { accepted: 'i_do', planned: 'e_planned', none_fit: 'e_none' } },
    I_DO, F_FB, ...E_COMMON,
    { id: 'e_planned', type: 'end', text: 'Записал: «{title}» в {time}. Напомню.' },
    { id: 'e_none', type: 'end', text: 'Ничего не попало — это тоже ответ. Вечером можно вернуться к кнопке «Провести вечер иначе».' }
  ] },
  { id: 'pre_evening', revision: 1, trigger: 'pre_evening', title: 'Скоро вечер', entry_node: 'q_pre', nodes: [
    { id: 'q_pre', type: 'question', text: 'Скоро вечер. Как хочешь его начать?', text_if: { has_plan: 'Скоро вечер. В плане — «{plan_title}». В силе?' },
      options: [
        { key: 'keep', label: 'Да, план в силе', if: 'has_plan', sets: { use_planned: true }, next: 'i_do' },
        { key: 'pick', label: 'Подобрать что-нибудь', next: 'q_need' },
        { key: 'skip', label: 'Сегодня не нужно', next: 'e_skip' }
      ] },
    Q_NEED('q_setting'), Q_SETTING('o_main'),
    { id: 'o_main', type: 'offer', text: 'Две идеи на начало вечера.',
      offer: { count: 2, diversity: 'category', allow_plan: true, allow_now: true, max_declines: 4 },
      on: { accepted: 'i_do', planned: 'e_planned', none_fit: 'e_none' } },
    I_DO, F_FB, ...E_COMMON,
    { id: 'e_planned', type: 'end', text: 'Записал: «{title}» в {time}.' },
    { id: 'e_none', type: 'end', text: 'Понял. Если вечером станет тяжело — кнопка «Провести вечер иначе» на главном экране.' },
    { id: 'e_skip', type: 'end', text: 'Хорошо. Хорошего вечера.' }
  ] },
  { id: 'craving_button', revision: 1, trigger: 'craving_button', title: 'Вечер иначе', entry_node: 'q_drank', nodes: [
    { id: 'q_drank', type: 'question', text: 'Сегодня уже пил?', skip_if: { 'ctx.intoxicated': '*' }, skip_next: 'q_need',
      options: [
        { key: 'no', label: 'Нет', sets: { intoxicated: false }, next: 'q_need' },
        { key: 'yes', label: 'Да, немного', sets: { intoxicated: true }, next: 'q_need' }
      ] },
    { ...Q_NEED('q_energy'), text: 'Чего сейчас больше хочется?' },
    Q_ENERGY('q_setting'), Q_SETTING('o_main'),
    { id: 'o_main', type: 'offer', text: 'Не будем придумывать тебе ещё одно полезное дело. Вот два варианта.',
      offer: { count: 2, diversity: 'category', allow_plan: false, allow_now: true, max_declines: 3 },
      on: { accepted: 'i_do', none_fit: 'q_still' } },
    { id: 'q_still', type: 'question', text: 'Похоже, сейчас ничего не цепляет. Что дальше?',
      options: [
        { key: 'more', label: 'Покажи ещё пару', next: 'o_more' },
        { key: 'drink', label: 'Всё равно выпью', next: 'flow:still_drink' },
        { key: 'wait', label: 'Просто подожду волну с таймером', next: 'e_timer' }
      ] },
    { id: 'o_more', type: 'offer', text: 'Ещё два варианта — совсем простых.',
      offer: { count: 2, diversity: 'category', allow_plan: false, allow_now: true, max_declines: 2, max_effort: 1 },
      on: { accepted: 'i_do', none_fit: 'q_still2' } },
    { id: 'q_still2', type: 'question', text: 'Не попал. Оставим предложения на сегодня?',
      options: [
        { key: 'drink', label: 'Всё равно выпью', next: 'flow:still_drink' },
        { key: 'wait', label: 'Подожду волну с таймером', next: 'e_timer' },
        { key: 'stop', label: 'Да, хватит', next: 'e_stop' }
      ] },
    I_DO, F_FB, ...E_COMMON,
    { id: 'e_timer', type: 'end', text: 'Волна тяги поднимается и спадает. Десять минут ничего не решай.', action: 'timer' },
    { id: 'e_stop', type: 'end', text: 'Хорошо. Завтра можно вернуться к этому без оценок.' }
  ] },
  { id: 'still_drink', revision: 1, trigger: 'still_drink', title: 'Хотя бы одно изменение', entry_node: 'q_intro', nodes: [
    { id: 'q_intro', type: 'question',
      text: 'Понял. Уговаривать не буду и экзамен на силу воли не устраиваю. Давай изменим хотя бы одну вещь — чтобы вечер не прошёл совсем на автомате.',
      options: [
        { key: 'ok', label: 'Давай', sets: { setting: 'home' }, next: 'o_shift' },
        { key: 'no', label: 'Нет, ничего не хочу', next: 'e_ok' }
      ] },
    { id: 'o_shift', type: 'offer', text: 'Одно небольшое изменение на выбор.',
      offer: { count: 2, category: 'alcohol_shift', allow_plan: false, allow_now: true, max_declines: 3 },
      on: { accepted: 'i_do', none_fit: 'e_ok' } },
    { id: 'i_do', type: 'instruction', on: { done: 'e_later', later: 'e_later' }, done_label: 'Попробую', schedule_followup: true },
    { id: 'e_later', type: 'end', text: 'Хорошо. Позже спрошу, отличался ли вечер. Утром — без оценок и обнуления серий.' },
    { id: 'e_ok', type: 'end', text: 'Хорошо. Если захочешь — завтра утром вернёмся к этому без оценок.' }
  ] }
];

const pack = { pack_id: 'core-ru', version: '1.0.0', format: 1, min_app_version: 3, published_at: '2026-10-23T00:00:00Z',
  locale: 'ru-RU', taxonomy, scenarios, flows };
writeFileSync(join(here, '../app/src/main/assets/content/core-ru.json'), JSON.stringify(pack, null, 1) + '\n');
console.log('scenarios', scenarios.length, 'flows', flows.length);

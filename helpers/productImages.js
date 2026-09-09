// Складання фінального масиву фото товару.
//
// Стара логіка була «прийшли файли — перезаписати image цілком»: додати одне
// фото до наявних було неможливо в принципі. Новий контракт описує ПІДСУМОК:
// адмінка каже, які наявні фото лишаються і в якому порядку, і додає нові
// файли. Бек із цього збирає фінальний масив і прибирає те, що випало.

const { cloudImageProduct, extractPublicId, deleteFromCloudinary } = require('./cloudinary');

const MAX_IMAGES = 15;
// Мітка позиції для ще не завантаженого файлу: у порядку, який шле адмінка,
// нове фото ще не має URL, тож стоїть як 'new:0' — індекс у масиві files.
const NEW_FILE_PREFIX = 'new:';

// Поле з multipart приходить як масив (кілька однойменних полів), як один
// рядок (одне поле) або як JSON-рядок. Приводимо до масиву рядків.
const toList = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    if (Array.isArray(value)) {
        return value.map(String);
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();

        if (trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);

                return Array.isArray(parsed) ? parsed.map(String) : [trimmed];
            } catch (error) {
                return [trimmed];
            }
        }

        return trimmed === '' ? [] : [trimmed];
    }

    return null;
};

// Розкладає порядок, який прислала адмінка, у фінальний масив URL.
//
// Токен — або готовий URL (наявне фото), або 'new:<індекс>' (файл із цього ж
// запиту). Невідомі токени й індекси поза межами відкидаємо мовчки: краще
// зберегти товар із меншою кількістю фото, ніж упасти на кривому вводі.
const applyOrder = (order, keepList, uploadedUrls) => {
    const keepSet = new Set(keepList);
    const used = new Set();
    const result = [];

    for (const token of order) {
        if (token.startsWith(NEW_FILE_PREFIX)) {
            const index = Number(token.slice(NEW_FILE_PREFIX.length));

            if (Number.isInteger(index) && uploadedUrls[index] !== undefined) {
                result.push(uploadedUrls[index]);
                used.add(index);
            }

            continue;
        }

        if (keepSet.has(token)) {
            result.push(token);
        }
    }

    // Файли, яких не було в порядку (адмінка старіша або порядок неповний),
    // дописуємо в кінець: втратити щойно завантажене фото гірше, ніж
    // поставити його не туди.
    uploadedUrls.forEach((url, index) => {
        if (!used.has(index)) {
            result.push(url);
        }
    });

    return result;
};

/**
 * Повертає фінальний масив image і список фото, які більше не потрібні.
 *
 * @param existing поточний image товару (для нового товару — []).
 * @param body req.body: keepImages і, за наявності, imageOrder.
 * @param files req.files від multer.
 */
const resolveProductImages = async (existing, body, files) => {
    const current = Array.isArray(existing) ? existing.filter(item => typeof item === 'string') : [];
    const incomingFiles = Array.isArray(files) ? files : [];
    const keepList = toList(body.keepImages);

    // ⚠️ Сумісність зі старою адмінкою. Поки нова збірка не залита на хостинг,
    // стара шле лише files і чекає, що вони замінять усе. Ознака нового
    // контракту — саме присутність keepImages, тож без нього поводимось як
    // раніше, і жодна вкладка з відкритою старою адмінкою нічого не зламає.
    if (keepList === null) {
        if (incomingFiles.length === 0) {
            return { image: null, orphans: [] };
        }

        const uploaded = await cloudImageProduct(incomingFiles);

        return { image: uploaded, orphans: [] };
    }

    // Лишаємо тільки те, що справді є в товарі: URL з тіла запиту не має
    // ставати способом приписати товару чуже фото.
    const keep = keepList.filter(url => current.includes(url));

    if (keep.length + incomingFiles.length > MAX_IMAGES) {
        const error = new Error(`Максимум ${MAX_IMAGES} фото на товар`);
        error.status = 400;

        throw error;
    }

    const uploadedUrls = incomingFiles.length > 0
        ? await cloudImageProduct(incomingFiles)
        : [];

    const order = toList(body.imageOrder);
    const image = order
        ? applyOrder(order, keep, uploadedUrls)
        : [...keep, ...uploadedUrls];

    const orphans = current.filter(url => !image.includes(url));

    return { image, orphans };
};

/**
 * Прибирає з Cloudinary фото, які випали з товару.
 *
 * ⚠️ Перед видаленням перевіряємо, що URL не використовує ІНШИЙ товар. Зараз
 * public_id містить таймстемп, тож збіги малоймовірні, але ціна помилки —
 * зникле фото в чужій картці, і дві дешеві перевірки того варті.
 */
const cleanupOrphans = async (orphans, models, ownId) => {
    for (const url of orphans) {
        try {
            const stillUsed = await Promise.all(
                models.map(model => model.countDocuments({ image: url, _id: { $ne: ownId } }))
            );

            if (stillUsed.some(count => count > 0)) {
                continue;
            }

            await deleteFromCloudinary(extractPublicId(url));
        } catch (error) {
            // Прибирання хмари не має зривати збереження товару.
            console.error('Не вдалося прибрати фото', url, error.message);
        }
    }
};

module.exports = {
    MAX_IMAGES,
    resolveProductImages,
    cleanupOrphans,
};

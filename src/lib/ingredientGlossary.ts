/**
 * v1 plain-language glossary for the Ingredients scanner: a static lookup from
 * common E-numbers and food-science terms to a short explanation, a risk tier,
 * and both in English and Bulgarian. Anything not covered here is simply not
 * covered — the report screen falls back to showing the ingredient's raw OFF
 * text as-is, and its risk badge as "unrated" (never defaulted to "safe").
 *
 * Risk tiers reflect well-documented public consumer-safety consensus (EU
 * additive restrictions/bans, EFSA/IARC findings, the Southampton study behind
 * the EU's child-hyperactivity warning label, etc.) — not an ad hoc guess per
 * entry. This is a simplified, informational guide, not a certified medical or
 * nutrition assessment.
 *
 * Not exhaustive by design (see AGENTS.md tweak notes): a future version could
 * send unmatched text to an LLM for a from-scratch explanation, which needs an
 * API key and is out of scope for v1.
 */
import type { AppLanguage } from '../i18n';

export type RiskTier = 'low' | 'moderate' | 'high';

/**
 * A real, sourced "why is this a concern" note for one additive, drawn
 * directly from EFSA's own OpenFoodTox safety-assessment database (a
 * substance's reference dose plus the specific EFSA opinion it came from) —
 * never written from general knowledge. See `ConcernNote` for how this
 * surfaces to callers when a substance has no such match.
 */
interface EfsaConcern {
  en: string;
  bg: string;
  sourceTitle: string;
  sourceUrl: string;
  year: number;
}

interface GlossaryEntry {
  /** Every string an ingredient's `id` or `text` might normalize to. */
  keys: string[];
  en: string;
  bg: string;
  tier: RiskTier;
  /** Only ever set for entries fetched from OpenFoodTox — see EfsaConcern. */
  efsaConcern?: EfsaConcern;
}

/**
 * The EFSA-sourced concern note for one ingredient — or, honestly, the lack
 * of one:
 *  - 'sourced': a real note exists, traceable to a specific EFSA opinion.
 *  - 'not-found': this is a food additive (has an E-number) but OpenFoodTox
 *    had no matching, verifiable entry for it — never filled in with a
 *    guess.
 *  - 'not-applicable': not an additive (a staple ingredient like "milk" or
 *    "sugar") — EFSA's additive safety-assessment database has nothing to
 *    say about it one way or the other, so no note is shown at all.
 */
export type ConcernNote =
  | ({ status: 'sourced' } & EfsaConcern)
  | { status: 'not-found' }
  | { status: 'not-applicable' };

export interface IngredientInfo {
  description: string;
  tier: RiskTier;
  concernNote: ConcernNote;
}

const ENTRIES: GlossaryEntry[] = [
  // --- Colors (E100-E180) ---------------------------------------------------
  { keys: ['E100'], en: 'Curcumin — a natural yellow-orange pigment from turmeric.', bg: 'Куркумин — естествен жълто-оранжев пигмент от куркума.', tier: 'low' },
  { keys: ['E101'], en: 'Riboflavin (vitamin B2) — a yellow, vitamin-derived color.', bg: 'Рибофлавин (витамин B2) — жълт оцветител, получен от витамин.', tier: 'low', efsaConcern: {
    en: "In its 2013 re-evaluation of riboflavin (E101) as a food additive, EFSA set an Acceptable Daily Intake (ADI) of 0.5 mg per kg of body weight per day.",
    bg: 'В преоценката си от 2013 г. на рибофлавин (E101) като хранителна добавка EFSA определи допустим дневен прием (ADI) от 0,5 mg на kg телесно тегло дневно.',
    sourceTitle: "Scientific Opinion on the re-evaluation of riboflavin (E 101(i)) and riboflavin-5'-phosphate sodium (E 101(ii)) as food additives.",
    sourceUrl: 'https://doi.org/10.2903/j.efsa.2013.3357',
    year: 2013,
  } },
  { keys: ['E102'], en: 'Tartrazine — a synthetic yellow dye. One of the "Southampton six" dyes that require an EU warning label about effects on children\'s activity and attention.', bg: 'Тартразин — синтетичен жълт багрилен агент. Един от "шестте от Саутхямптън" оцветители, изискващи предупредителен етикет в ЕС за ефекти върху активността и вниманието на децата.', tier: 'high' },
  { keys: ['E104'], en: 'Quinoline yellow — a synthetic yellow dye. One of the "Southampton six" dyes that require an EU warning label about effects on children\'s activity and attention.', bg: 'Хинолин жълто — синтетичен жълт багрилен агент. Един от "шестте от Саутхямптън" оцветители, изискващи предупредителен етикет в ЕС.', tier: 'high', efsaConcern: {
    en: "EFSA's 2015 refined exposure assessment for Quinoline Yellow (E104) is based on an Acceptable Daily Intake (ADI) of 0.5 mg per kg of body weight per day.",
    bg: 'Уточнената оценка на експозицията на EFSA от 2015 г. за хинолин жълто (E104) се основава на допустим дневен прием (ADI) от 0,5 mg на kg телесно тегло дневно.',
    sourceTitle: 'Refined exposure assessment for Quinoline Yellow (E 104)',
    sourceUrl: 'https://doi.org/10.2903/j.efsa.2015.4070',
    year: 2015,
  } },
  { keys: ['E110'], en: 'Sunset yellow FCF — a synthetic orange-yellow dye. One of the "Southampton six" dyes that require an EU warning label about effects on children\'s activity and attention.', bg: 'Sunset yellow FCF — синтетичен оранжево-жълт багрилен агент. Един от "шестте от Саутхямптън" оцветители, изискващи предупредителен етикет в ЕС.', tier: 'high' },
  { keys: ['E120', 'cochineal', 'carmine', 'carminic acid'], en: 'Cochineal / carmine — a red dye made from crushed insects; a known allergen for some people.', bg: 'Кошенил / кармин — червен багрилен агент, получен от смлени насекоми; познат алерген за някои хора.', tier: 'moderate' },
  { keys: ['E122'], en: 'Azorubine (carmoisine) — a synthetic red dye. One of the "Southampton six" dyes that require an EU warning label about effects on children\'s activity and attention.', bg: 'Азорубин (кармоазин) — синтетичен червен багрилен агент. Един от "шестте от Саутхямптън" оцветители, изискващи предупредителен етикет в ЕС.', tier: 'high' },
  { keys: ['E124'], en: 'Ponceau 4R — a synthetic red dye. One of the "Southampton six" dyes that require an EU warning label about effects on children\'s activity and attention.', bg: 'Понсо 4R — синтетичен червен багрилен агент. Един от "шестте от Саутхямптън" оцветители, изискващи предупредителен етикет в ЕС.', tier: 'high' },
  { keys: ['E127'], en: 'Erythrosine — a synthetic red dye; its use is restricted over thyroid concerns.', bg: 'Еритрозин — синтетичен червен багрилен агент; употребата му е ограничена заради опасения за щитовидната жлеза.', tier: 'moderate' },
  { keys: ['E129'], en: 'Allura red AC — a synthetic red dye. One of the "Southampton six" dyes that require an EU warning label about effects on children\'s activity and attention.', bg: 'Алура червено AC — синтетичен червен багрилен агент. Един от "шестте от Саутхямптън" оцветители, изискващи предупредителен етикет в ЕС.', tier: 'high' },
  { keys: ['E131'], en: 'Patent blue V — a synthetic blue dye; occasionally linked to allergic reactions.', bg: 'Патентно синьо V — синтетичен син багрилен агент; понякога свързван с алергични реакции.', tier: 'moderate' },
  { keys: ['E132', 'indigotine', 'indigo carmine'], en: 'Indigotine (indigo carmine) — a synthetic blue dye; occasionally linked to allergic reactions.', bg: 'Индиготин (индиго кармин) — синтетичен син багрилен агент; понякога свързван с алергични реакции.', tier: 'moderate' },
  { keys: ['E133'], en: 'Brilliant blue FCF — a synthetic blue dye.', bg: 'Брилянтно синьо FCF — синтетичен син багрилен агент.', tier: 'moderate' },
  { keys: ['E140', 'chlorophylls', 'chlorophyll'], en: 'Chlorophylls — a natural green pigment from plants.', bg: 'Хлорофили — естествен зелен пигмент от растения.', tier: 'low' },
  { keys: ['E141'], en: 'Copper complexes of chlorophylls — a stabilized natural green pigment.', bg: 'Медни комплекси на хлорофила — стабилизиран естествен зелен пигмент.', tier: 'low' },
  { keys: ['E142'], en: 'Green S — a synthetic green dye.', bg: 'Зелено S — синтетичен зелен багрилен агент.', tier: 'moderate' },
  { keys: ['E150a', 'E150b', 'E150c', 'E150d', 'E150', 'caramel color', 'caramel colour'], en: 'Caramel color — a brown coloring made by heating sugar. Some forms (class III/IV) can contain trace 4-MEI, a compound under scrutiny.', bg: 'Карамелов колорант — кафяв оцветител, получен чрез загряване на захар. Някои форми (клас III/IV) могат да съдържат следи от 4-MEI, съединение под наблюдение.', tier: 'moderate' },
  { keys: ['E151'], en: 'Brilliant black BN — a synthetic black dye, restricted or banned in some countries outside the EU.', bg: 'Брилянтно черно BN — синтетичен черен багрилен агент, ограничен или забранен в някои страни извън ЕС.', tier: 'moderate' },
  { keys: ['E153'], en: 'Vegetable carbon — a black coloring made from charcoal.', bg: 'Растителен въглен — черен оцветител на основата на въглен.', tier: 'low' },
  { keys: ['E160a', 'carotene', 'carotenes', 'beta-carotene'], en: 'Carotenes — a natural orange-yellow pigment, also found in carrots.', bg: 'Каротини — естествен оранжево-жълт пигмент, среща се и в морковите.', tier: 'low' },
  { keys: ['E160c', 'paprika extract'], en: 'Paprika extract — a natural red-orange pigment from paprika peppers.', bg: 'Екстракт от чушки — естествен червено-оранжев пигмент от чушки.', tier: 'low' },
  { keys: ['E160e', 'E160f'], en: "Beta-apo-carotenal — an orange, carotene-related coloring.", bg: 'Бета-апо-каротенал — оранжев оцветител, свързан с каротина.', tier: 'low' },
  { keys: ['E161b', 'lutein'], en: 'Lutein — a yellow pigment naturally found in plants.', bg: 'Лутеин — жълт пигмент, естествено срещащ се в растенията.', tier: 'low' },
  { keys: ['E162', 'beetroot red', 'betanin'], en: 'Beetroot red (betanin) — a red pigment from beets.', bg: 'Червено от цвекло (бетанин) — червен пигмент от цвекло.', tier: 'low' },
  { keys: ['E163', 'anthocyanins', 'anthocyanin'], en: 'Anthocyanins — a red-purple pigment from berries and grape skins.', bg: 'Антоциани — червено-лилав пигмент от плодове и гроздова кожица.', tier: 'low' },
  { keys: ['E170', 'calcium carbonate'], en: 'Calcium carbonate — a white mineral used as a coloring, anti-caking agent, or calcium source (also known as chalk).', bg: 'Калциев карбонат — бял минерал, използван като оцветител, антислепващ агент или източник на калций (известен и като тебешир).', tier: 'low', efsaConcern: {
    en: "In its 2023 re-evaluation of calcium carbonate (E170) as a food additive, EFSA did not consider it necessary to allocate a numerical Acceptable Daily Intake — meaning no safety concern was identified at the additive's intended use levels.",
    bg: 'В преоценката си от 2023 г. на калциев карбонат (E170) като хранителна добавка EFSA не намери за необходимо да определи числов допустим дневен прием (ADI) — тоест не бе установено опасение за безопасността при предвидените нива на употреба.',
    sourceTitle: 'Re-evaluation of calcium carbonate (E 170) as a food additive in foods for infants below 16 weeks of age and follow-up of its re-evaluation as food additive for uses in foods for all population groups',
    sourceUrl: 'https://doi.org/10.2903/j.efsa.2023.8106',
    year: 2023,
  } },
  { keys: ['E171', 'titanium dioxide'], en: 'Titanium dioxide — a white mineral pigment, now banned as a food additive in the EU over genotoxicity concerns.', bg: 'Титанов диоксид — бял минерален пигмент, вече забранен като хранителна добавка в ЕС заради опасения за генотоксичност.', tier: 'high' },
  { keys: ['E172', 'iron oxides', 'iron oxide'], en: 'Iron oxides — natural red, yellow, or black mineral pigments.', bg: 'Железни оксиди — естествени червени, жълти или черни минерални пигменти.', tier: 'low' },
  { keys: ['E175', 'gold'], en: 'Gold — a decorative metallic coloring, used only on food surfaces.', bg: 'Злато — декоративен метален оцветител, използван само по повърхността на храната.', tier: 'low' },
  { keys: ['E180'], en: 'Litholrubine BK — a synthetic red dye, mostly used on cheese rind.', bg: 'Литолрубин BK — синтетичен червен багрилен агент, използван предимно по кората на сирене.', tier: 'moderate' },

  // --- Preservatives (E200-E299) --------------------------------------------
  { keys: ['E200', 'sorbic acid'], en: 'Sorbic acid — a preservative that stops mold and yeast growth.', bg: 'Сорбинова киселина — консервант, който спира растежа на плесени и дрожди.', tier: 'low' },
  { keys: ['E202', 'potassium sorbate'], en: 'Potassium sorbate — a preservative that stops mold and yeast growth.', bg: 'Калиев сорбат — консервант, който спира растежа на плесени и дрожди.', tier: 'low' },
  { keys: ['E203', 'calcium sorbate'], en: 'Calcium sorbate — a preservative that stops mold and yeast growth.', bg: 'Калциев сорбат — консервант, който спира растежа на плесени и дрожди.', tier: 'low' },
  { keys: ['E210', 'benzoic acid'], en: 'Benzoic acid — a preservative against bacteria, yeast, and mold; can form traces of benzene when combined with vitamin C.', bg: 'Бензоена киселина — консервант срещу бактерии, дрожди и плесени; може да образува следи от бензен в комбинация с витамин C.', tier: 'moderate', efsaConcern: {
    en: "EFSA's 2016 re-evaluation of benzoic acid (E210) and the benzoate salts (E211–E213) as food additives set a shared group Acceptable Daily Intake (ADI) of 5 mg per kg of body weight per day.",
    bg: 'В преоценката си от 2016 г. на бензоена киселина (E210) и бензоатните соли (E211–E213) като хранителни добавки EFSA определи обща групова допустима дневна доза (ADI) от 5 mg на kg телесно тегло дневно.',
    sourceTitle: 'Scientific Opinion on the re-evaluation of benzoic acid (E 210), sodium benzoate (E 211), potassium benzoate (E 212) and calcium benzoate (E 213) as food additives',
    sourceUrl: 'https://doi.org/10.2903/j.efsa.2016.4433',
    year: 2016,
  } },
  { keys: ['E211', 'sodium benzoate'], en: 'Sodium benzoate — a preservative against bacteria, yeast, and mold; linked in some studies to hyperactivity when combined with certain dyes.', bg: 'Натриев бензоат — консервант срещу бактерии, дрожди и плесени; в някои изследвания е свързан с хиперактивност в комбинация с определени оцветители.', tier: 'moderate', efsaConcern: {
    en: "EFSA's 2016 re-evaluation of sodium benzoate (E211), alongside benzoic acid (E210) and the other benzoate salts, set a shared group Acceptable Daily Intake (ADI) of 5 mg per kg of body weight per day.",
    bg: 'В преоценката си от 2016 г. на натриев бензоат (E211), заедно с бензоена киселина (E210) и другите бензоатни соли, EFSA определи обща групова допустима дневна доза (ADI) от 5 mg на kg телесно тегло дневно.',
    sourceTitle: 'Scientific Opinion on the re-evaluation of benzoic acid (E 210), sodium benzoate (E 211), potassium benzoate (E 212) and calcium benzoate (E 213) as food additives',
    sourceUrl: 'https://doi.org/10.2903/j.efsa.2016.4433',
    year: 2016,
  } },
  { keys: ['E212', 'potassium benzoate'], en: 'Potassium benzoate — a preservative against bacteria, yeast, and mold.', bg: 'Калиев бензоат — консервант срещу бактерии, дрожди и плесени.', tier: 'moderate', efsaConcern: {
    en: "EFSA's 2016 re-evaluation of potassium benzoate (E212), alongside benzoic acid (E210) and the other benzoate salts, set a shared group Acceptable Daily Intake (ADI) of 5 mg per kg of body weight per day.",
    bg: 'В преоценката си от 2016 г. на калиев бензоат (E212), заедно с бензоена киселина (E210) и другите бензоатни соли, EFSA определи обща групова допустима дневна доза (ADI) от 5 mg на kg телесно тегло дневно.',
    sourceTitle: 'Scientific Opinion on the re-evaluation of benzoic acid (E 210), sodium benzoate (E 211), potassium benzoate (E 212) and calcium benzoate (E 213) as food additives',
    sourceUrl: 'https://doi.org/10.2903/j.efsa.2016.4433',
    year: 2016,
  } },
  { keys: ['E220', 'sulphur dioxide', 'sulfur dioxide'], en: 'Sulphur dioxide — a preservative and antioxidant, common in dried fruit and wine; can trigger reactions in people with sulfite sensitivity or asthma.', bg: 'Серен диоксид — консервант и антиоксидант, често срещан в сушени плодове и вино; може да предизвика реакции при хора с чувствителност към сулфити или астма.', tier: 'moderate' },
  { keys: ['E221', 'sodium sulphite', 'sodium sulfite'], en: 'Sodium sulphite — a preservative and antioxidant; can trigger reactions in people with sulfite sensitivity.', bg: 'Натриев сулфит — консервант и антиоксидант; може да предизвика реакции при хора с чувствителност към сулфити.', tier: 'moderate' },
  { keys: ['E223', 'sodium metabisulphite', 'sodium metabisulfite'], en: 'Sodium metabisulphite — a preservative and antioxidant; can trigger reactions in people with sulfite sensitivity.', bg: 'Натриев метабисулфит — консервант и антиоксидант; може да предизвика реакции при хора с чувствителност към сулфити.', tier: 'moderate' },
  { keys: ['E224', 'potassium metabisulphite', 'potassium metabisulfite'], en: 'Potassium metabisulphite — a preservative and antioxidant, common in wine; can trigger reactions in people with sulfite sensitivity.', bg: 'Калиев метабисулфит — консервант и антиоксидант, често срещан във виното; може да предизвика реакции при хора с чувствителност към сулфити.', tier: 'moderate' },
  { keys: ['E228', 'potassium bisulphite', 'potassium bisulfite'], en: 'Potassium bisulphite — a preservative and antioxidant; can trigger reactions in people with sulfite sensitivity.', bg: 'Калиев бисулфит — консервант и антиоксидант; може да предизвика реакции при хора с чувствителност към сулфити.', tier: 'moderate' },
  { keys: ['E234', 'nisin'], en: 'Nisin — a natural preservative produced by bacterial fermentation.', bg: 'Низин — естествен консервант, получен чрез бактериална ферментация.', tier: 'low' },
  { keys: ['E235', 'natamycin'], en: 'Natamycin — an antifungal preservative, common on cheese rind.', bg: 'Натамицин — противогъбичен консервант, често срещан по кората на сирене.', tier: 'low' },
  { keys: ['E239', 'hexamethylene tetramine', 'hexamine'], en: 'Hexamethylene tetramine — a preservative used in some cheeses; releases small amounts of formaldehyde as it works.', bg: 'Хексаметилентетрамин — консервант, използван в някои сирена; отделя малки количества формалдехид при действието си.', tier: 'moderate' },
  { keys: ['E242', 'dimethyl dicarbonate'], en: 'Dimethyl dicarbonate — a preservative used in soft drinks and wine; breaks down quickly and leaves no residue.', bg: 'Диметил дикарбонат — консервант, използван в безалкохолни напитки и вино; разгражда се бързо и не оставя остатък.', tier: 'low' },
  { keys: ['E249', 'potassium nitrite'], en: 'Potassium nitrite — a curing-salt preservative used in processed meats; can form nitrosamines, compounds linked to cancer risk.', bg: 'Калиев нитрит — консервант, използван при осоляване на месни продукти; може да образува нитрозамини, съединения, свързани с риск от рак.', tier: 'high' },
  { keys: ['E250', 'sodium nitrite'], en: 'Sodium nitrite — a curing-salt preservative used in processed meats; can form nitrosamines, compounds linked to cancer risk.', bg: 'Натриев нитрит — консервант, използван при осоляване на месни продукти; може да образува нитрозамини, съединения, свързани с риск от рак.', tier: 'high' },
  { keys: ['E251', 'sodium nitrate'], en: 'Sodium nitrate — a curing-salt preservative used in processed meats; converts to nitrite in the body.', bg: 'Натриев нитрат — консервант, използван при осоляване на месни продукти; преобразува се в нитрит в организма.', tier: 'moderate' },
  { keys: ['E252', 'potassium nitrate'], en: 'Potassium nitrate — a curing-salt preservative used in processed meats; converts to nitrite in the body.', bg: 'Калиев нитрат — консервант, използван при осоляване на месни продукти; преобразува се в нитрит в организма.', tier: 'moderate' },
  { keys: ['E260', 'acetic acid'], en: "Acetic acid — vinegar's acid, used as a preservative and acidity regulator.", bg: 'Оцетна киселина — киселината в оцета, използвана като консервант и регулатор на киселинността.', tier: 'low' },
  { keys: ['E261', 'potassium acetate'], en: 'Potassium acetate — an acidity regulator.', bg: 'Калиев ацетат — регулатор на киселинността.', tier: 'low' },
  { keys: ['E262', 'sodium acetate', 'sodium acetates', 'sodium diacetate'], en: 'Sodium acetate — an acidity regulator and preservative.', bg: 'Натриев ацетат — регулатор на киселинността и консервант.', tier: 'low' },
  { keys: ['E263', 'calcium acetate'], en: 'Calcium acetate — an acidity regulator.', bg: 'Калциев ацетат — регулатор на киселинността.', tier: 'low' },
  { keys: ['E270', 'lactic acid'], en: 'Lactic acid — a natural acid from fermentation, used as a preservative and acidity regulator.', bg: 'Млечна киселина — естествена киселина от ферментация, използвана като консервант и регулатор на киселинността.', tier: 'low' },
  { keys: ['E280', 'propionic acid'], en: 'Propionic acid — a preservative against mold, common in bread.', bg: 'Пропионова киселина — консервант срещу плесени, често срещан в хляба.', tier: 'low' },
  { keys: ['E281', 'sodium propionate'], en: 'Sodium propionate — a preservative against mold, common in bread.', bg: 'Натриев пропионат — консервант срещу плесени, често срещан в хляба.', tier: 'low' },
  { keys: ['E282', 'calcium propionate'], en: 'Calcium propionate — a preservative against mold, common in bread.', bg: 'Калциев пропионат — консервант срещу плесени, често срещан в хляба.', tier: 'low' },
  { keys: ['E283', 'potassium propionate'], en: 'Potassium propionate — a preservative against mold.', bg: 'Калиев пропионат — консервант срещу плесени.', tier: 'low' },
  { keys: ['E290', 'carbon dioxide'], en: 'Carbon dioxide — the gas used for carbonation, also acts as a preservative.', bg: 'Въглероден диоксид — газ, използван за газиране, действа и като консервант.', tier: 'low' },

  // --- Antioxidants / acidity regulators (E300-E385) ------------------------
  { keys: ['E300', 'ascorbic acid', 'vitamin c'], en: 'Ascorbic acid (vitamin C) — a natural antioxidant.', bg: 'Аскорбинова киселина (витамин C) — естествен антиоксидант.', tier: 'low' },
  { keys: ['E301', 'sodium ascorbate'], en: 'Sodium ascorbate — an antioxidant, a form of vitamin C.', bg: 'Натриев аскорбат — антиоксидант, форма на витамин C.', tier: 'low' },
  { keys: ['E306', 'tocopherols', 'vitamin e'], en: 'Tocopherols (vitamin E) — a natural antioxidant.', bg: 'Токофероли (витамин E) — естествен антиоксидант.', tier: 'low' },
  { keys: ['E307', 'alpha-tocopherol'], en: 'Alpha-tocopherol — a synthetic form of vitamin E, used as an antioxidant.', bg: 'Алфа-токоферол — синтетична форма на витамин E, използвана като антиоксидант.', tier: 'low' },
  { keys: ['E320', 'bha', 'butylated hydroxyanisole'], en: 'BHA (butylated hydroxyanisole) — a synthetic antioxidant classified by IARC as a possible human carcinogen.', bg: 'BHA (бутилхидроксианизол) — синтетичен антиоксидант, класифициран от IARC като възможен канцероген за човека.', tier: 'high', efsaConcern: {
    en: "EFSA's 2012 statement on exposure to butylated hydroxyanisole (E320, BHA) applies an Acceptable Daily Intake (ADI) of 1 mg per kg of body weight per day when assessing dietary exposure.",
    bg: 'Изявлението на EFSA от 2012 г. относно експозицията на бутилхидроксианизол (E320, BHA) прилага допустим дневен прием (ADI) от 1 mg на kg телесно тегло дневно при оценката на хранителната експозиция.',
    sourceTitle: 'Statement on the safety assessment of the exposure to butylated hydroxyanisole E 320 (BHA) by applying a new exposure assessment methodology',
    sourceUrl: 'https://doi.org/10.2903/j.efsa.2012.2759',
    year: 2012,
  } },
  { keys: ['E321', 'bht', 'butylated hydroxytoluene'], en: 'BHT (butylated hydroxytoluene) — a synthetic antioxidant; under scrutiny for possible endocrine effects.', bg: 'BHT (бутилхидрокситолуен) — синтетичен антиоксидант; под наблюдение заради възможни ефекти върху ендокринната система.', tier: 'moderate' },
  { keys: ['E322', 'lecithin', 'soy lecithin', 'sunflower lecithin'], en: 'Lecithin — a natural emulsifier, often from soy or sunflower.', bg: 'Лецитин — естествен емулгатор, често от соя или слънчоглед.', tier: 'low' },
  { keys: ['E325', 'sodium lactate'], en: 'Sodium lactate — an acidity regulator that also helps retain moisture.', bg: 'Натриев лактат — регулатор на киселинността, който помага и за задържане на влага.', tier: 'low' },
  { keys: ['E326', 'potassium lactate'], en: 'Potassium lactate — an acidity regulator.', bg: 'Калиев лактат — регулатор на киселинността.', tier: 'low' },
  { keys: ['E330', 'citric acid'], en: 'Citric acid — a natural acidity regulator/preservative found in citrus fruit.', bg: 'Лимонена киселина — естествен регулатор на киселинността/консервант, среща се в цитрусовите плодове.', tier: 'low' },
  { keys: ['E331', 'sodium citrate', 'sodium citrates'], en: 'Sodium citrates — an acidity regulator.', bg: 'Натриеви цитрати — регулатор на киселинността.', tier: 'low' },
  { keys: ['E332', 'potassium citrate', 'potassium citrates'], en: 'Potassium citrates — an acidity regulator.', bg: 'Калиеви цитрати — регулатор на киселинността.', tier: 'low' },
  { keys: ['E333', 'calcium citrate', 'calcium citrates'], en: 'Calcium citrates — an acidity regulator and firming agent.', bg: 'Калциеви цитрати — регулатор на киселинността и втвърдяващ агент.', tier: 'low' },
  { keys: ['E334', 'tartaric acid'], en: 'Tartaric acid — a natural acid found in grapes.', bg: 'Винена киселина — естествена киселина, среща се в гроздето.', tier: 'low' },
  { keys: ['E335', 'sodium tartrate', 'sodium tartrates'], en: 'Sodium tartrates — an acidity regulator.', bg: 'Натриеви тартрати — регулатор на киселинността.', tier: 'low' },
  { keys: ['E336', 'potassium tartrate', 'potassium tartrates', 'cream of tartar'], en: 'Potassium tartrates (cream of tartar) — an acidity regulator and stabilizer.', bg: 'Калиеви тартрати (винен камък) — регулатор на киселинността и стабилизатор.', tier: 'low' },
  { keys: ['E338', 'phosphoric acid'], en: 'Phosphoric acid — an acidity regulator, common in cola-style drinks; high intake is linked to bone and kidney concerns.', bg: 'Фосфорна киселина — регулатор на киселинността, често срещан в кола-напитки; високият прием е свързан с опасения за костите и бъбреците.', tier: 'moderate' },
  { keys: ['E339', 'sodium phosphate', 'sodium phosphates'], en: 'Sodium phosphates — an acidity regulator and emulsifying salt; high intake is linked to bone and kidney concerns.', bg: 'Натриеви фосфати — регулатор на киселинността и емулгираща сол; високият прием е свързан с опасения за костите и бъбреците.', tier: 'moderate' },
  { keys: ['E340', 'potassium phosphate', 'potassium phosphates'], en: 'Potassium phosphates — an acidity regulator and emulsifying salt; high intake is linked to bone and kidney concerns.', bg: 'Калиеви фосфати — регулатор на киселинността и емулгираща сол; високият прием е свързан с опасения за костите и бъбреците.', tier: 'moderate' },
  { keys: ['E341', 'calcium phosphate', 'calcium phosphates'], en: 'Calcium phosphates — an acidity regulator, firming agent, and calcium source.', bg: 'Калциеви фосфати — регулатор на киселинността, втвърдяващ агент и източник на калций.', tier: 'low' },
  { keys: ['E343', 'magnesium phosphate', 'magnesium phosphates'], en: 'Magnesium phosphates — an acidity regulator.', bg: 'Магнезиеви фосфати — регулатор на киселинността.', tier: 'low' },
  { keys: ['E350', 'sodium malate', 'sodium malates'], en: 'Sodium malates — an acidity regulator.', bg: 'Натриеви малати — регулатор на киселинността.', tier: 'low' },
  { keys: ['E351', 'potassium malate'], en: 'Potassium malate — an acidity regulator.', bg: 'Калиев малат — регулатор на киселинността.', tier: 'low' },
  { keys: ['E353', 'metatartaric acid'], en: 'Metatartaric acid — an acidity regulator used in wine.', bg: 'Метавинена киселина — регулатор на киселинността, използван във виното.', tier: 'low' },
  { keys: ['E355', 'adipic acid'], en: 'Adipic acid — an acidity regulator.', bg: 'Адипинова киселина — регулатор на киселинността.', tier: 'low' },
  { keys: ['E363', 'succinic acid'], en: 'Succinic acid — an acidity regulator.', bg: 'Янтарна киселина — регулатор на киселинността.', tier: 'low' },
  { keys: ['E375', 'niacin', 'vitamin b3'], en: 'Niacin (vitamin B3) — used as a color stabilizer, also a vitamin.', bg: 'Ниацин (витамин B3) — използва се за стабилизиране на цвета, също и витамин.', tier: 'low' },
  { keys: ['E380', 'triammonium citrate'], en: 'Triammonium citrate — an acidity regulator.', bg: 'Триамониев цитрат — регулатор на киселинността.', tier: 'low' },
  { keys: ['E385', 'calcium disodium edta'], en: 'Calcium disodium EDTA — helps preservatives and antioxidants work by binding trace metals; used sparingly due to cumulative intake limits.', bg: 'Калциев динатриев EDTA — подпомага действието на консерванти и антиоксиданти чрез свързване на метални йони; използва се в малки количества заради ограничения за кумулативен прием.', tier: 'moderate' },

  // --- Thickeners / stabilizers / emulsifiers (E400-E495) -------------------
  { keys: ['E400', 'alginic acid'], en: 'Alginic acid — a natural thickener from seaweed.', bg: 'Алгинова киселина — естествен сгъстител от водорасли.', tier: 'low' },
  { keys: ['E401', 'sodium alginate'], en: 'Sodium alginate — a natural thickener/gelling agent from seaweed.', bg: 'Натриев алгинат — естествен сгъстител/желиращ агент от водорасли.', tier: 'low' },
  { keys: ['E402', 'potassium alginate'], en: 'Potassium alginate — a natural thickener from seaweed.', bg: 'Калиев алгинат — естествен сгъстител от водорасли.', tier: 'low' },
  { keys: ['E404', 'calcium alginate'], en: 'Calcium alginate — a natural thickener/gelling agent from seaweed.', bg: 'Калциев алгинат — естествен сгъстител/желиращ агент от водорасли.', tier: 'low' },
  { keys: ['E405', 'propylene glycol alginate'], en: 'Propylene glycol alginate — a thickener/stabilizer from seaweed.', bg: 'Пропиленгликолов алгинат — сгъстител/стабилизатор от водорасли.', tier: 'low' },
  { keys: ['E406', 'agar'], en: 'Agar — a gelling agent made from seaweed.', bg: 'Агар — желиращ агент, получен от водорасли.', tier: 'low' },
  { keys: ['E407', 'carrageenan'], en: 'Carrageenan — a thickener/gelling agent from seaweed; some studies link it to gut inflammation.', bg: 'Карагенан — сгъстител/желиращ агент от водорасли; някои изследвания го свързват с чревно възпаление.', tier: 'moderate' },
  { keys: ['E410', 'locust bean gum', 'carob gum'], en: 'Locust bean gum — a natural thickener from carob seeds.', bg: 'Локустово брашно (гума) — естествен сгъстител от семена на рожков.', tier: 'low', efsaConcern: {
    en: "In its 2023 re-evaluation of locust bean gum (E410) as a food additive, EFSA did not consider it necessary to allocate a numerical Acceptable Daily Intake — meaning no safety concern was identified at the additive's intended use levels.",
    bg: 'В преоценката си от 2023 г. на локустово брашно (E410) като хранителна добавка EFSA не намери за необходимо да определи числов допустим дневен прием (ADI) — тоест не бе установено опасение за безопасността при предвидените нива на употреба.',
    sourceTitle: 'Re-evaluation of locust bean gum (E 410) as a food additive in foods for infants below 16 weeks of age and follow-up of its re-evaluation as a food additive for uses in foods for all population groups',
    sourceUrl: 'https://doi.org/10.2903/j.efsa.2023.7775',
    year: 2023,
  } },
  { keys: ['E412', 'guar gum'], en: 'Guar gum — a natural thickener from guar beans.', bg: 'Гуарова гума — естествен сгъстител от гуарови бобчета.', tier: 'low' },
  { keys: ['E413', 'tragacanth'], en: 'Tragacanth — a natural thickener from tree sap.', bg: 'Трагакант — естествен сгъстител от дървесен сок.', tier: 'low' },
  { keys: ['E414', 'gum arabic', 'acacia gum'], en: 'Gum arabic (acacia gum) — a natural thickener/stabilizer from tree sap.', bg: 'Гума арабика (акациева гума) — естествен сгъстител/стабилизатор от дървесен сок.', tier: 'low' },
  { keys: ['E415', 'xanthan gum'], en: 'Xanthan gum — a thickener made by fermenting sugar.', bg: 'Ксантанова гума — сгъстител, получен чрез ферментация на захар.', tier: 'low', efsaConcern: {
    en: "In its 2023 re-evaluation of xanthan gum (E415) as a food additive, EFSA did not consider it necessary to allocate a numerical Acceptable Daily Intake — meaning no safety concern was identified at the additive's intended use levels.",
    bg: 'В преоценката си от 2023 г. на ксантанова гума (E415) като хранителна добавка EFSA не намери за необходимо да определи числов допустим дневен прием (ADI) — тоест не бе установено опасение за безопасността при предвидените нива на употреба.',
    sourceTitle: 'Re-evaluation of xanthan gum (E 415) as a food additive in foods for infants below 16 weeks of age and follow-up of its re-evaluation as a food additive for uses in foods for all population groups',
    sourceUrl: 'https://doi.org/10.2903/j.efsa.2023.7951',
    year: 2023,
  } },
  { keys: ['E416', 'karaya gum'], en: 'Karaya gum — a natural thickener from tree sap.', bg: 'Карая гума — естествен сгъстител от дървесен сок.', tier: 'low' },
  { keys: ['E417', 'tara gum'], en: 'Tara gum — a natural thickener from tara seeds.', bg: 'Тара гума — естествен сгъстител от семена на тара.', tier: 'low' },
  { keys: ['E420', 'sorbitol'], en: 'Sorbitol — a sugar-alcohol sweetener that also retains moisture; can have a laxative effect in large amounts.', bg: 'Сорбитол — подсладител (захарен алкохол), който помага и за задържане на влага; в големи количества може да има лек лаксативен ефект.', tier: 'low' },
  { keys: ['E421', 'mannitol'], en: 'Mannitol — a sugar-alcohol sweetener, also used as an anti-caking agent; can have a laxative effect in large amounts.', bg: 'Манитол — подсладител (захарен алкохол), използва се и като антислепващ агент; в големи количества може да има лек лаксативен ефект.', tier: 'low' },
  { keys: ['E422', 'glycerol', 'glycerin', 'glycerine'], en: 'Glycerol — a moisture-retaining sweetener and solvent.', bg: 'Глицерол — подсладител, който задържа влага, използва се и като разтворител.', tier: 'low' },
  { keys: ['E425', 'konjac'], en: 'Konjac — a thickener/gelling agent from konjac root.', bg: 'Конжак — сгъстител/желиращ агент от корен на конжак.', tier: 'low' },
  { keys: ['E430', 'E431', 'E432', 'E433', 'E434', 'E435', 'E436', 'polysorbate', 'polysorbates', 'sorbitan ester', 'sorbitan esters'], en: 'Polysorbates / sorbitan esters — synthetic emulsifiers; some studies link them to changes in gut bacteria.', bg: 'Полисорбати / сорбитанови естери — синтетични емулгатори; някои изследвания ги свързват с промени в чревната микрофлора.', tier: 'moderate' },
  { keys: ['E440', 'pectin'], en: 'Pectin — a natural gelling agent from fruit, used to set jam.', bg: 'Пектин — естествен желиращ агент от плодове, използван за сгъстяване на конфитюр.', tier: 'low' },
  { keys: ['E441', 'gelatine', 'gelatin'], en: 'Gelatine — a gelling agent made from animal collagen.', bg: 'Желатин — желиращ агент, получен от животински колаген.', tier: 'low' },
  { keys: ['E442', 'ammonium phosphatides'], en: 'Ammonium phosphatides — an emulsifier, common in chocolate.', bg: 'Амониеви фосфатиди — емулгатор, често срещан в шоколада.', tier: 'moderate' },
  { keys: ['E450', 'diphosphates', 'diphosphate'], en: 'Diphosphates — an emulsifying salt that also helps retain water; high intake is linked to bone and kidney concerns.', bg: 'Дифосфати — емулгираща сол, която помага и за задържане на вода; високият прием е свързан с опасения за костите и бъбреците.', tier: 'moderate' },
  { keys: ['E451', 'triphosphates', 'triphosphate'], en: 'Triphosphates — an emulsifying salt that also helps retain water; high intake is linked to bone and kidney concerns.', bg: 'Трифосфати — емулгираща сол, която помага и за задържане на вода; високият прием е свързан с опасения за костите и бъбреците.', tier: 'moderate' },
  { keys: ['E460', 'cellulose'], en: 'Cellulose — a natural thickener and anti-caking agent from plant fiber.', bg: 'Целулоза — естествен сгъстител и антислепващ агент от растителни влакна.', tier: 'low' },
  { keys: ['E461', 'methyl cellulose'], en: 'Methyl cellulose — a thickener made from plant fiber.', bg: 'Метилцелулоза — сгъстител, получен от растителни влакна.', tier: 'low' },
  { keys: ['E463', 'hydroxypropyl cellulose'], en: 'Hydroxypropyl cellulose — a thickener made from plant fiber.', bg: 'Хидроксипропилцелулоза — сгъстител, получен от растителни влакна.', tier: 'low' },
  { keys: ['E464', 'hydroxypropyl methyl cellulose', 'hpmc'], en: 'Hydroxypropyl methyl cellulose — a thickener made from plant fiber.', bg: 'Хидроксипропилметилцелулоза — сгъстител, получен от растителни влакна.', tier: 'low' },
  { keys: ['E466', 'carboxymethyl cellulose', 'cmc'], en: 'Carboxymethyl cellulose (CMC) — a thickener made from plant fiber.', bg: 'Карбоксиметилцелулоза (CMC) — сгъстител, получен от растителни влакна.', tier: 'low' },
  { keys: ['E470a', 'E470b', 'E470'], en: 'Fatty acid salts — an emulsifier and anti-caking agent.', bg: 'Соли на мастни киселини — емулгатор и антислепващ агент.', tier: 'low' },
  { keys: ['E471', 'mono- and diglycerides of fatty acids', 'mono and diglycerides'], en: 'Mono- and diglycerides of fatty acids — a common emulsifier.', bg: 'Моно- и диглицериди на мастни киселини — често срещан емулгатор.', tier: 'low' },
  { keys: ['E472e', 'datem'], en: 'DATEM — an emulsifier commonly used in bread.', bg: 'DATEM — емулгатор, често използван в хляба.', tier: 'moderate' },
  { keys: ['E473', 'sucrose esters of fatty acids'], en: 'Sucrose esters of fatty acids — an emulsifier.', bg: 'Захарни естери на мастни киселини — емулгатор.', tier: 'low' },
  { keys: ['E475', 'polyglycerol esters of fatty acids'], en: 'Polyglycerol esters of fatty acids — an emulsifier.', bg: 'Полиглицеролови естери на мастни киселини — емулгатор.', tier: 'low' },
  { keys: ['E476', 'pgpr', 'polyglycerol polyricinoleate'], en: 'Polyglycerol polyricinoleate (PGPR) — an emulsifier commonly used in chocolate.', bg: 'Полиглицеролов полирицинолеат (PGPR) — емулгатор, често използван в шоколада.', tier: 'moderate' },
  { keys: ['E477', 'propylene glycol esters of fatty acids'], en: 'Propylene glycol esters of fatty acids — an emulsifier.', bg: 'Пропиленгликолови естери на мастни киселини — емулгатор.', tier: 'moderate' },
  { keys: ['E481', 'sodium stearoyl lactylate'], en: 'Sodium stearoyl lactylate — an emulsifier and dough conditioner.', bg: 'Натриев стеароил лактилат — емулгатор и подобрител на тестото.', tier: 'low' },
  { keys: ['E491', 'E492', 'E493', 'E494', 'E495'], en: 'Sorbitan esters — synthetic emulsifiers.', bg: 'Сорбитанови естери — синтетични емулгатори.', tier: 'moderate' },

  // --- pH regulators / anti-caking (E500-E578) ------------------------------
  { keys: ['E500', 'sodium carbonate', 'sodium carbonates', 'baking soda', 'sodium bicarbonate'], en: 'Sodium carbonates — a raising agent and acidity regulator (includes baking soda).', bg: 'Натриеви карбонати — набухвател и регулатор на киселинността (включва сода бикарбонат).', tier: 'low' },
  { keys: ['E501', 'potassium carbonate', 'potassium carbonates'], en: 'Potassium carbonates — an acidity regulator.', bg: 'Калиеви карбонати — регулатор на киселинността.', tier: 'low' },
  { keys: ['E503', 'ammonium carbonate', 'ammonium carbonates'], en: 'Ammonium carbonates — a raising agent.', bg: 'Амониеви карбонати — набухвател.', tier: 'low' },
  { keys: ['E504', 'magnesium carbonate', 'magnesium carbonates'], en: 'Magnesium carbonates — an acidity regulator and anti-caking agent.', bg: 'Магнезиеви карбонати — регулатор на киселинността и антислепващ агент.', tier: 'low' },
  { keys: ['E507', 'hydrochloric acid'], en: 'Hydrochloric acid — an acidity regulator.', bg: 'Солна киселина — регулатор на киселинността.', tier: 'low' },
  { keys: ['E508', 'potassium chloride'], en: 'Potassium chloride — a salt substitute and gelling aid.', bg: 'Калиев хлорид — заместител на солта и помощно средство за желиране.', tier: 'low' },
  { keys: ['E509', 'calcium chloride'], en: 'Calcium chloride — a firming agent.', bg: 'Калциев хлорид — втвърдяващ агент.', tier: 'low' },
  { keys: ['E511', 'magnesium chloride'], en: 'Magnesium chloride — a firming agent, common in tofu-making.', bg: 'Магнезиев хлорид — втвърдяващ агент, често срещан при производството на тофу.', tier: 'low' },
  { keys: ['E513', 'sulphuric acid', 'sulfuric acid'], en: 'Sulphuric acid — an acidity regulator.', bg: 'Сярна киселина — регулатор на киселинността.', tier: 'low' },
  { keys: ['E514', 'sodium sulphate', 'sodium sulphates', 'sodium sulfate'], en: 'Sodium sulphates — an acidity regulator.', bg: 'Натриеви сулфати — регулатор на киселинността.', tier: 'low' },
  { keys: ['E516', 'calcium sulphate', 'calcium sulfate'], en: 'Calcium sulphate — a firming agent and mineral source (also plaster of Paris).', bg: 'Калциев сулфат — втвърдяващ агент и минерален източник (известен и като гипс).', tier: 'low' },
  { keys: ['E518', 'magnesium sulphate', 'magnesium sulfate', 'epsom salt'], en: 'Magnesium sulphate (Epsom salt) — a firming agent.', bg: 'Магнезиев сулфат (английска сол) — втвърдяващ агент.', tier: 'low' },
  { keys: ['E520', 'E521', 'E522', 'E523', 'aluminium sulphate', 'aluminium sulphates'], en: 'Aluminium sulphates — a firming agent; aluminium exposure is monitored for cumulative dietary intake limits.', bg: 'Алуминиеви сулфати — втвърдяващ агент; експозицията на алуминий се следи заради ограничения за кумулативен хранителен прием.', tier: 'moderate' },
  { keys: ['E524', 'sodium hydroxide', 'lye'], en: 'Sodium hydroxide (lye) — an acidity regulator, used to give pretzels their crust; fully neutralized during processing.', bg: 'Натриева основа (луга) — регулатор на киселинността, придава характерната коричка на солени кренвирши/претцели; напълно неутрализирана по време на обработката.', tier: 'low' },
  { keys: ['E535', 'sodium ferrocyanide'], en: 'Sodium ferrocyanide — an anti-caking agent used in table salt; considered low-toxicity but used in tightly capped amounts.', bg: 'Натриев ферроцианид — антислепващ агент, използван в готварската сол; счита се за нискотоксичен, но се използва в стриктно ограничени количества.', tier: 'moderate' },
  { keys: ['E536', 'potassium ferrocyanide'], en: 'Potassium ferrocyanide — an anti-caking agent used in table salt; considered low-toxicity but used in tightly capped amounts.', bg: 'Калиев ферроцианид — антислепващ агент, използван в готварската сол; счита се за нискотоксичен, но се използва в стриктно ограничени количества.', tier: 'moderate' },
  { keys: ['E551', 'silicon dioxide', 'silica'], en: 'Silicon dioxide (silica) — an anti-caking agent.', bg: 'Силициев диоксид (силициев двуокис) — антислепващ агент.', tier: 'low', efsaConcern: {
    en: "In its 2024 re-evaluation of silicon dioxide (E551) as a food additive, EFSA did not consider it necessary to allocate a numerical Acceptable Daily Intake — meaning no safety concern was identified at the additive's intended use levels.",
    bg: 'В преоценката си от 2024 г. на силициев диоксид (E551) като хранителна добавка EFSA не намери за необходимо да определи числов допустим дневен прием (ADI) — тоест не бе установено опасение за безопасността при предвидените нива на употреба.',
    sourceTitle: 'Re-evaluation of silicon dioxide (E 551) as a food additive in foods for infants below 16 weeks of age and follow-up of its re-evaluation as a food additive for uses in foods for all population groups',
    sourceUrl: 'https://doi.org/10.2903/j.efsa.2024.8880',
    year: 2024,
  } },
  { keys: ['E552', 'calcium silicate'], en: 'Calcium silicate — an anti-caking agent.', bg: 'Калциев силикат — антислепващ агент.', tier: 'low' },
  { keys: ['E553b', 'talc'], en: 'Talc — an anti-caking agent.', bg: 'Талк — антислепващ агент.', tier: 'low' },
  { keys: ['E554', 'sodium aluminium silicate'], en: 'Sodium aluminium silicate — an anti-caking agent; aluminium exposure is monitored for cumulative dietary intake limits.', bg: 'Натриево-алуминиев силикат — антислепващ агент; експозицията на алуминий се следи заради ограничения за кумулативен хранителен прием.', tier: 'moderate' },
  { keys: ['E558', 'bentonite'], en: 'Bentonite — a clay used as an anti-caking or clarifying agent.', bg: 'Бентонит — глина, използвана като антислепващ или избистрящ агент.', tier: 'low' },
  { keys: ['E559', 'kaolin', 'aluminium silicate'], en: 'Aluminium silicate (kaolin) — an anti-caking agent; aluminium exposure is monitored for cumulative dietary intake limits.', bg: 'Алуминиев силикат (каолин) — антислепващ агент; експозицията на алуминий се следи заради ограничения за кумулативен хранителен прием.', tier: 'moderate' },
  { keys: ['E570', 'fatty acids', 'fatty acid'], en: 'Fatty acids — used as an anti-foaming or glazing agent.', bg: 'Мастни киселини — използват се като пенопотискащ или глазиращ агент.', tier: 'low' },
  { keys: ['E574', 'gluconic acid'], en: 'Gluconic acid — an acidity regulator.', bg: 'Глюконова киселина — регулатор на киселинността.', tier: 'low' },
  { keys: ['E575', 'glucono delta-lactone', 'gdl'], en: 'Glucono delta-lactone — an acidity regulator, common in cured meats.', bg: 'Глюконо делта-лактон — регулатор на киселинността, често срещан в осолени месни продукти.', tier: 'low' },
  { keys: ['E577', 'potassium gluconate'], en: 'Potassium gluconate — an acidity regulator.', bg: 'Калиев глюконат — регулатор на киселинността.', tier: 'low' },
  { keys: ['E578', 'calcium gluconate'], en: 'Calcium gluconate — a firming agent and mineral source.', bg: 'Калциев глюконат — втвърдяващ агент и минерален източник.', tier: 'low' },

  // --- Flavor enhancers (E600-E640) -----------------------------------------
  { keys: ['E620', 'glutamic acid'], en: 'Glutamic acid — a natural umami flavor enhancer; some people report sensitivity to free glutamate.', bg: 'Глутаминова киселина — естествен усилвател на вкуса (умами); някои хора съобщават за чувствителност към свободния глутамат.', tier: 'moderate' },
  { keys: ['E621', 'msg', 'monosodium glutamate'], en: 'Monosodium glutamate (MSG) — a flavor enhancer that adds a savory (umami) taste; considered safe by major food authorities, though some people report sensitivity.', bg: 'Мононатриев глутамат (MSG) — усилвател на вкуса, придава наситен (умами) вкус; счита се за безопасен от основните органи по храните, но някои хора съобщават за чувствителност.', tier: 'moderate' },
  { keys: ['E622', 'monopotassium glutamate'], en: 'Monopotassium glutamate — a flavor enhancer, similar to MSG.', bg: 'Монокалиев глутамат — усилвател на вкуса, подобен на MSG.', tier: 'moderate' },
  { keys: ['E623', 'calcium diglutamate'], en: 'Calcium diglutamate — a flavor enhancer, similar to MSG.', bg: 'Калциев диглутамат — усилвател на вкуса, подобен на MSG.', tier: 'moderate' },
  { keys: ['E627', 'disodium guanylate'], en: 'Disodium guanylate — a flavor enhancer, often paired with MSG.', bg: 'Динатриев гуанилат — усилвател на вкуса, често комбиниран с MSG.', tier: 'moderate' },
  { keys: ['E631', 'disodium inosinate'], en: 'Disodium inosinate — a flavor enhancer, often paired with MSG.', bg: 'Динатриев инозинат — усилвател на вкуса, често комбиниран с MSG.', tier: 'moderate' },
  { keys: ['E635', "disodium 5'-ribonucleotides", 'disodium ribonucleotides'], en: 'Disodium ribonucleotides — a flavor enhancer blend, often paired with MSG.', bg: 'Динатриеви рибонуклеотиди — смес от усилватели на вкуса, често комбинирана с MSG.', tier: 'moderate' },
  { keys: ['E640', 'glycine'], en: "Glycine — an amino acid used as a flavor and sweetness modifier.", bg: 'Глицин — аминокиселина, използвана за коригиране на вкуса и сладостта.', tier: 'low' },

  // --- Sweeteners ------------------------------------------------------------
  { keys: ['E950', 'acesulfame k', 'acesulfame potassium'], en: 'Acesulfame K — an artificial, calorie-free sweetener; regulators consider it safe, though it remains a commonly debated additive.', bg: 'Ацесулфам К — изкуствен, безкалоричен подсладител; регулаторите го смятат за безопасен, но остава често обсъждана добавка.', tier: 'moderate', efsaConcern: {
    en: "EFSA's 2016 assessment of an extended use of acesulfame K (E950) in foods for special medical purposes applies an Acceptable Daily Intake (ADI) of 9 mg per kg of body weight per day.",
    bg: 'Оценката на EFSA от 2016 г. на разширена употреба на ацесулфам К (E950) в храни за специални медицински цели прилага допустим дневен прием (ADI) от 9 mg на kg телесно тегло дневно.',
    sourceTitle: 'Safety of the proposed extension of use of acesulfame K (E 950) in foods for special medical purposes in young children',
    sourceUrl: 'https://doi.org/10.2903/j.efsa.2016.4437',
    year: 2016,
  } },
  { keys: ['E951', 'aspartame'], en: 'Aspartame — an artificial sweetener classified by IARC as a possible human carcinogen in 2023 (at typical intakes, major food authorities still consider it safe); contains phenylalanine.', bg: 'Аспартам — изкуствен подсладител, класифициран от IARC като възможен канцероген за човека през 2023 г. (при типичен прием основните органи по храните все още го смятат за безопасен); съдържа фенилаланин.', tier: 'moderate' },
  { keys: ['E952', 'cyclamate'], en: 'Cyclamate — an artificial, calorie-free sweetener; banned in the US but permitted in the EU.', bg: 'Цикламат — изкуствен, безкалоричен подсладител; забранен в САЩ, но разрешен в ЕС.', tier: 'moderate' },
  { keys: ['E953', 'isomalt'], en: 'Isomalt — a sugar-alcohol sweetener.', bg: 'Изомалт — подсладител (захарен алкохол).', tier: 'low' },
  { keys: ['E954', 'saccharin'], en: 'Saccharin — an artificial, calorie-free sweetener; an early cancer scare was later cleared by regulators, but it remains commonly flagged.', bg: 'Захарин — изкуствен, безкалоричен подсладител; ранни опасения за рак по-късно бяха отхвърлени от регулаторите, но остава често отбелязвана добавка.', tier: 'moderate' },
  { keys: ['E955', 'sucralose'], en: 'Sucralose — an artificial, calorie-free sweetener; recent studies on gut and DNA effects are debated, though regulators still consider it safe.', bg: 'Сукралоза — изкуствен, безкалоричен подсладител; скорошни изследвания за ефекти върху червата и ДНК се обсъждат, но регулаторите все още я смятат за безопасна.', tier: 'moderate' },
  { keys: ['E957', 'thaumatin'], en: 'Thaumatin — a natural sweetener and flavor enhancer from a West African fruit.', bg: 'Тауматин — естествен подсладител и усилвател на вкуса от западноафрикански плод.', tier: 'low' },
  { keys: ['E959', 'neohesperidine dc'], en: 'Neohesperidine DC — an artificial, calorie-free sweetener.', bg: 'Неохесперидин DC — изкуствен, безкалоричен подсладител.', tier: 'moderate' },
  { keys: ['E960', 'steviol glycosides', 'stevia'], en: 'Steviol glycosides (stevia) — a natural, plant-derived sweetener.', bg: 'Стевиолови гликозиди (стевия) — естествен подсладител от растителен произход.', tier: 'low' },
  { keys: ['E961', 'neotame'], en: 'Neotame — an artificial, calorie-free sweetener.', bg: 'Неотам — изкуствен, безкалоричен подсладител.', tier: 'moderate' },
  { keys: ['E962'], en: 'Aspartame-acesulfame salt — an artificial sweetener combining two sweeteners.', bg: 'Сол на аспартам-ацесулфам — изкуствен подсладител, комбиниращ два подсладителя.', tier: 'moderate' },
  { keys: ['E965', 'maltitol'], en: 'Maltitol — a sugar-alcohol sweetener.', bg: 'Малтитол — подсладител (захарен алкохол).', tier: 'low' },
  { keys: ['E967', 'xylitol'], en: 'Xylitol — a sugar-alcohol sweetener.', bg: 'Ксилитол — подсладител (захарен алкохол).', tier: 'low' },
  { keys: ['E968', 'erythritol'], en: 'Erythritol — a sugar-alcohol sweetener, mostly calorie-free.', bg: 'Еритритол — подсладител (захарен алкохол), почти безкалоричен.', tier: 'low' },

  // --- Waxes / glazing / anti-foaming (E900-E914) ---------------------------
  { keys: ['E900', 'dimethyl polysiloxane'], en: 'Dimethyl polysiloxane — an anti-foaming agent, a food-grade silicone.', bg: 'Диметил полисилоксан — пенопотискащ агент, хранителен силикон.', tier: 'moderate' },
  { keys: ['E901', 'beeswax'], en: 'Beeswax — a natural glazing agent.', bg: 'Пчелен восък — естествен глазиращ агент.', tier: 'low' },
  { keys: ['E903', 'carnauba wax'], en: 'Carnauba wax — a glazing agent from palm leaves.', bg: 'Карнаубов восък — глазиращ агент от палмови листа.', tier: 'low' },
  { keys: ['E904', 'shellac'], en: 'Shellac — a glazing agent made from insect resin.', bg: 'Шеллак — глазиращ агент, получен от смола на насекоми.', tier: 'low' },
  { keys: ['E905', 'paraffin wax'], en: 'Paraffin wax — a food-grade wax coating used as a glazing agent.', bg: 'Парафинов восък — хранителна восъчна обвивка, използвана като глазиращ агент.', tier: 'low' },
  { keys: ['E914', 'oxidized polyethylene wax'], en: 'Oxidized polyethylene wax — a glazing agent.', bg: 'Окислен полиетиленов восък — глазиращ агент.', tier: 'moderate' },

  // --- Modified starches / misc -----------------------------------------------
  { keys: ['E1400', 'E1401', 'E1402', 'E1403', 'E1404', 'E1410', 'E1412', 'E1413', 'E1414', 'E1420', 'E1422', 'E1440', 'E1442', 'E1450', 'E1451', 'E1452', 'modified starch', 'modified maize starch', 'modified corn starch'], en: 'Modified starch — a thickener derived from starch, altered to change how it thickens or holds up to heat.', bg: 'Модифицирано нишесте — сгъстител на основата на нишесте, преработен, за да променя как сгъстява или как издържа на топлина.', tier: 'low' },
  { keys: ['E1505', 'triethyl citrate'], en: 'Triethyl citrate — a foam stabilizer and carrier.', bg: 'Триетил цитрат — стабилизатор на пяна и носител.', tier: 'low' },

  // --- Common non-E-numbered terms --------------------------------------------
  { keys: ['hydrolyzed vegetable protein', 'hydrolysed vegetable protein', 'hvp'], en: 'Hydrolyzed vegetable protein — plant protein broken down chemically to boost savory flavor; naturally rich in free glutamate.', bg: 'Хидролизиран растителен протеин — растителен протеин, разграден химически за подсилване на вкуса; естествено богат на свободен глутамат.', tier: 'moderate' },
  { keys: ['hydrogenated vegetable oil', 'hydrogenated oil'], en: 'Hydrogenated vegetable oil — oil chemically hardened; may contain trans fats, which health authorities recommend minimizing.', bg: 'Хидрогенирано растително масло — химически втвърдено масло; може да съдържа трансмазнини, чийто прием здравните органи препоръчват да се сведе до минимум.', tier: 'high' },
  { keys: ['partially hydrogenated oil', 'partially hydrogenated vegetable oil'], en: 'Partially hydrogenated oil — oil partly hardened chemically; the main dietary source of trans fats, which the WHO recommends eliminating from food supplies.', bg: 'Частично хидрогенирано масло — частично химически втвърдено масло; основен хранителен източник на трансмазнини, чието премахване от храните препоръчва СЗО.', tier: 'high' },
  { keys: ['palm oil', 'palm fat'], en: 'Palm oil — a common vegetable oil pressed from the fruit of the oil palm; high in saturated fat.', bg: 'Палмово масло — често използвано растително масло, добито от плода на маслената палма; богато на наситени мазнини.', tier: 'moderate' },
  { keys: ['high fructose corn syrup', 'hfcs'], en: 'High fructose corn syrup — a liquid sweetener made from corn starch, linked in excess to metabolic health concerns.', bg: 'Царевичен сироп с висока фруктоза — течен подсладител, произведен от царевично нишесте, свързван при прекомерна употреба с метаболитни здравословни проблеми.', tier: 'moderate' },
  { keys: ['invert sugar syrup', 'invert sugar'], en: 'Invert sugar syrup — a sugar syrup that resists crystallizing and keeps foods moist.', bg: 'Инвертна захарна смес — захарен сироп, който не кристализира лесно и запазва храната влажна.', tier: 'low' },
  { keys: ['whey powder', 'whey', 'whey solids'], en: 'Whey powder — a dried dairy byproduct of cheese-making, adds protein and a milky flavor.', bg: 'Суроватъчен прах — изсушен млечен страничен продукт от производството на сирене, добавя протеин и млечен вкус.', tier: 'low' },
  { keys: ['natural flavouring', 'natural flavoring', 'natural flavours', 'natural flavors'], en: 'Natural flavoring — flavor compounds derived from natural (plant or animal) sources.', bg: 'Натурален ароматизатор — ароматни съединения, получени от естествени (растителни или животински) източници.', tier: 'low' },
  { keys: ['artificial flavouring', 'artificial flavoring', 'artificial flavours', 'artificial flavors'], en: 'Artificial flavoring — flavor compounds produced synthetically; the exact composition is rarely disclosed.', bg: 'Изкуствен ароматизатор — ароматни съединения, произведени синтетично; точният състав рядко се разкрива.', tier: 'moderate' },
  { keys: ['yeast extract'], en: 'Yeast extract — a flavor enhancer made from yeast, naturally rich in glutamate.', bg: 'Дрождов екстракт — усилвател на вкуса, получен от дрожди, естествено богат на глутамат.', tier: 'low' },
  { keys: ['maltodextrin'], en: 'Maltodextrin — a mild-tasting carbohydrate made from starch, used as a thickener or filler.', bg: 'Малтодекстрин — въглехидрат с мек вкус, получен от нишесте, използван като сгъстител или пълнител.', tier: 'low' },
  { keys: ['dextrose', 'glucose'], en: 'Dextrose — another name for glucose, a simple sugar.', bg: 'Декстроза — друго име за глюкоза, обикновена захар.', tier: 'low' },

  // --- Common staple ingredients (not additives) ------------------------------
  // These aren't E-numbers or processed-food buzzwords, but they're what most
  // products are actually made of — without them, nearly every everyday
  // product (dairy, bread, produce) came back "unrated" for lack of coverage.
  { keys: ['water'], en: 'Water.', bg: 'Вода.', tier: 'low' },
  { keys: ['milk', 'whole milk', 'pasteurised milk', 'pasteurized milk', 'uht milk'], en: 'Milk.', bg: 'Мляко.', tier: 'low' },
  { keys: ['skimmed milk', 'skim milk', 'nonfat milk', 'fat free milk'], en: 'Skimmed milk.', bg: 'Обезмаслено мляко.', tier: 'low' },
  { keys: ['semi-skimmed milk', 'semi skimmed milk', 'low fat milk', 'partially skimmed milk'], en: 'Semi-skimmed milk.', bg: 'Полуобезмаслено мляко.', tier: 'low' },
  { keys: ['milk powder', 'dried milk', 'powdered milk', 'whole milk powder'], en: 'Milk powder — milk with the water removed.', bg: 'Млечен прах — мляко с отстранена вода.', tier: 'low' },
  { keys: ['skimmed milk powder', 'skim milk powder', 'nonfat dry milk'], en: 'Skimmed milk powder.', bg: 'Обезмаслен млечен прах.', tier: 'low' },
  { keys: ['milk protein', 'milk proteins'], en: 'Milk protein.', bg: 'Млечен протеин.', tier: 'low' },
  { keys: ['milk fat', 'milkfat', 'anhydrous milk fat'], en: 'Milk fat.', bg: 'Млечна мазнина.', tier: 'low' },
  { keys: ['cream', 'fresh cream'], en: 'Cream.', bg: 'Сметана.', tier: 'low' },
  { keys: ['sour cream'], en: 'Sour cream.', bg: 'Кисела сметана.', tier: 'low' },
  { keys: ['buttermilk'], en: 'Buttermilk.', bg: 'Мътеница.', tier: 'low' },
  { keys: ['butter'], en: 'Butter.', bg: 'Масло.', tier: 'low' },
  { keys: ['margarine'], en: 'Margarine — a butter substitute made from vegetable oils.', bg: 'Маргарин — заместител на маслото, направен от растителни масла.', tier: 'low' },
  { keys: ['cheese'], en: 'Cheese.', bg: 'Сирене/кашкавал.', tier: 'low' },
  { keys: ['cream cheese', 'soft white cheese', 'soft cheese'], en: 'Cream cheese.', bg: 'Крема сирене.', tier: 'low' },
  { keys: ['curd', 'quark'], en: 'Curd — a fresh, soft dairy product.', bg: 'Извара — прясен, мек млечен продукт.', tier: 'low' },
  { keys: ['yogurt', 'yoghurt', 'natural yogurt', 'natural yoghurt'], en: 'Yogurt.', bg: 'Кисело мляко.', tier: 'low' },
  { keys: ['casein'], en: 'Casein — the main milk protein.', bg: 'Казеин — основният млечен протеин.', tier: 'low' },
  { keys: ['caseinate', 'sodium caseinate', 'calcium caseinate'], en: 'Caseinate — a milk protein used as a stabilizer or protein source.', bg: 'Казеинат — млечен протеин, използван като стабилизатор или източник на протеин.', tier: 'low' },
  { keys: ['whey protein', 'whey protein concentrate', 'whey protein isolate'], en: 'Whey protein — a dairy protein isolated from whey.', bg: 'Суроватъчен протеин — млечен протеин, изолиран от суроватка.', tier: 'low' },
  { keys: ['lactic ferments', 'lactic cultures', 'lactic acid bacteria', 'lactic acid cultures', 'selected lactic cultures', 'ferment', 'ferments', 'live cultures', 'active cultures', 'starter culture', 'starter cultures'], en: 'Lactic ferments — live bacterial cultures used to ferment dairy (e.g. into yogurt).', bg: 'Млечнокисели култури — живи бактериални култури, използвани за ферментация на млечни продукти (напр. в кисело мляко).', tier: 'low' },
  { keys: ['rennet', 'microbial rennet', 'coagulating enzyme', 'microbial coagulating enzyme'], en: 'Rennet — an enzyme used to curdle milk into cheese.', bg: 'Сирище — ензим, използван за пресичане на млякото при производство на сирене.', tier: 'low' },
  { keys: ['lactase'], en: 'Lactase — an enzyme that breaks down lactose, used to make lactose-free dairy.', bg: 'Лактаза — ензим, разграждащ лактозата, използван за производство на безлактозни млечни продукти.', tier: 'low' },
  { keys: ['egg', 'eggs', 'whole egg', 'liquid egg'], en: 'Egg.', bg: 'Яйце.', tier: 'low' },
  { keys: ['egg white', 'egg whites'], en: 'Egg white.', bg: 'Яйчен белтък.', tier: 'low' },
  { keys: ['egg yolk', 'egg yolks'], en: 'Egg yolk.', bg: 'Яйчен жълтък.', tier: 'low' },
  { keys: ['salt', 'sea salt', 'table salt', 'iodised salt', 'iodized salt'], en: 'Salt.', bg: 'Сол.', tier: 'low' },
  { keys: ['sugar', 'cane sugar', 'brown sugar', 'granulated sugar', 'white sugar', 'beet sugar'], en: 'Sugar.', bg: 'Захар.', tier: 'low' },
  { keys: ['honey'], en: 'Honey.', bg: 'Мед.', tier: 'low' },
  { keys: ['molasses'], en: 'Molasses — a thick syrup left over from refining sugar.', bg: 'Меласа — гъст сироп, остатък от рафинирането на захар.', tier: 'low' },
  { keys: ['wheat flour', 'flour', 'white flour', 'plain flour', 'wheat'], en: 'Wheat flour.', bg: 'Пшенично брашно.', tier: 'low' },
  { keys: ['whole wheat flour', 'wholemeal flour', 'whole grain flour'], en: 'Whole wheat flour.', bg: 'Пълнозърнесто пшенично брашно.', tier: 'low' },
  { keys: ['rye flour', 'rye'], en: 'Rye flour.', bg: 'Ръжено брашно.', tier: 'low' },
  { keys: ['corn flour', 'cornflour', 'maize flour'], en: 'Corn flour.', bg: 'Царевично брашно.', tier: 'low' },
  { keys: ['rice flour'], en: 'Rice flour.', bg: 'Оризово брашно.', tier: 'low' },
  { keys: ['oat flour'], en: 'Oat flour.', bg: 'Овесено брашно.', tier: 'low' },
  { keys: ['semolina', 'durum wheat', 'durum wheat semolina'], en: 'Semolina — coarsely ground durum wheat.', bg: 'Грис — едро смляна твърда пшеница.', tier: 'low' },
  { keys: ['oats', 'rolled oats', 'oat', 'whole oats'], en: 'Oats.', bg: 'Овес.', tier: 'low' },
  { keys: ['rice'], en: 'Rice.', bg: 'Ориз.', tier: 'low' },
  { keys: ['corn', 'maize', 'sweetcorn'], en: 'Corn.', bg: 'Царевица.', tier: 'low' },
  { keys: ['corn starch', 'cornstarch', 'maize starch'], en: 'Corn starch.', bg: 'Царевично нишесте.', tier: 'low' },
  { keys: ['potato starch'], en: 'Potato starch.', bg: 'Картофено нишесте.', tier: 'low' },
  { keys: ['tapioca starch', 'tapioca'], en: 'Tapioca starch — a starch from cassava root.', bg: 'Тапиока нишесте — нишесте от корен на маниока.', tier: 'low' },
  { keys: ['wheat starch'], en: 'Wheat starch.', bg: 'Пшенично нишесте.', tier: 'low' },
  { keys: ['wheat gluten', 'gluten', 'vital wheat gluten'], en: 'Wheat gluten — the protein that gives wheat dough its structure.', bg: 'Пшеничен глутен — протеинът, който придава структура на пшеничното тесто.', tier: 'low' },
  { keys: ['soy protein', 'soy protein isolate', 'soya protein'], en: 'Soy protein.', bg: 'Соев протеин.', tier: 'low' },
  { keys: ['pea protein'], en: 'Pea protein.', bg: 'Грахов протеин.', tier: 'low' },
  { keys: ['olive oil', 'extra virgin olive oil'], en: 'Olive oil.', bg: 'Зехтин.', tier: 'low' },
  { keys: ['sunflower oil'], en: 'Sunflower oil.', bg: 'Слънчогледово масло.', tier: 'low' },
  { keys: ['rapeseed oil', 'canola oil'], en: 'Rapeseed (canola) oil.', bg: 'Рапично масло.', tier: 'low' },
  { keys: ['vegetable oil', 'vegetable fat', 'vegetable oils'], en: 'Vegetable oil — the specific plant source isn’t disclosed.', bg: 'Растително масло — конкретният растителен източник не е посочен.', tier: 'low' },
  { keys: ['coconut oil'], en: 'Coconut oil.', bg: 'Кокосово масло.', tier: 'low' },
  { keys: ['coconut'], en: 'Coconut.', bg: 'Кокос.', tier: 'low' },
  { keys: ['coconut milk'], en: 'Coconut milk.', bg: 'Кокосово мляко.', tier: 'low' },
  { keys: ['cocoa', 'cocoa solids'], en: 'Cocoa.', bg: 'Какао.', tier: 'low' },
  { keys: ['cocoa powder'], en: 'Cocoa powder.', bg: 'Какао на прах.', tier: 'low' },
  { keys: ['cocoa mass', 'cocoa liquor', 'cocoa paste'], en: 'Cocoa mass — ground cocoa beans, unsweetened.', bg: 'Какаова маса — смлени какаови зърна, без подсладители.', tier: 'low' },
  { keys: ['cocoa butter'], en: 'Cocoa butter — the natural fat of the cocoa bean.', bg: 'Какаово масло — естествената мазнина на какаовото зърно.', tier: 'low' },
  { keys: ['dark chocolate'], en: 'Dark chocolate.', bg: 'Тъмен шоколад.', tier: 'low' },
  { keys: ['milk chocolate'], en: 'Milk chocolate.', bg: 'Млечен шоколад.', tier: 'low' },
  { keys: ['vanilla', 'vanilla pod', 'vanilla bean', 'vanilla beans', 'bourbon vanilla', 'bourbon vanilla beans'], en: 'Vanilla.', bg: 'Ванилия.', tier: 'low' },
  { keys: ['vanilla extract', 'bourbon vanilla extract', 'natural vanilla flavouring', 'natural vanilla flavoring'], en: 'Vanilla extract.', bg: 'Ванилов екстракт.', tier: 'low' },
  { keys: ['vanillin'], en: 'Vanillin — a synthetic or natural single-compound version of vanilla’s flavor.', bg: 'Ванилин — синтетична или естествена еднокомпонентна версия на аромата на ванилия.', tier: 'low' },
  { keys: ['cinnamon'], en: 'Cinnamon.', bg: 'Канела.', tier: 'low' },
  { keys: ['black pepper', 'pepper'], en: 'Black pepper.', bg: 'Черен пипер.', tier: 'low' },
  { keys: ['ginger'], en: 'Ginger.', bg: 'Джинджифил.', tier: 'low' },
  { keys: ['nutmeg'], en: 'Nutmeg.', bg: 'Мускатово орехче.', tier: 'low' },
  { keys: ['garlic'], en: 'Garlic.', bg: 'Чесън.', tier: 'low' },
  { keys: ['onion'], en: 'Onion.', bg: 'Лук.', tier: 'low' },
  { keys: ['tomato', 'tomatoes'], en: 'Tomato.', bg: 'Домат.', tier: 'low' },
  { keys: ['tomato paste', 'tomato puree'], en: 'Tomato paste.', bg: 'Доматено пюре.', tier: 'low' },
  { keys: ['apple', 'apples'], en: 'Apple.', bg: 'Ябълка.', tier: 'low' },
  { keys: ['apple juice', 'apple juice concentrate', 'concentrated apple juice'], en: 'Apple juice.', bg: 'Ябълков сок.', tier: 'low' },
  { keys: ['orange', 'oranges'], en: 'Orange.', bg: 'Портокал.', tier: 'low' },
  { keys: ['orange juice'], en: 'Orange juice.', bg: 'Портокалов сок.', tier: 'low' },
  { keys: ['lemon juice'], en: 'Lemon juice.', bg: 'Лимонов сок.', tier: 'low' },
  { keys: ['lemon juice concentrate', 'concentrated lemon juice'], en: 'Lemon juice concentrate.', bg: 'Концентриран лимонов сок.', tier: 'low' },
  { keys: ['lime juice'], en: 'Lime juice.', bg: 'Сок от лайм.', tier: 'low' },
  { keys: ['banana', 'bananas'], en: 'Banana.', bg: 'Банан.', tier: 'low' },
  { keys: ['strawberry', 'strawberries'], en: 'Strawberry.', bg: 'Ягода.', tier: 'low' },
  { keys: ['raspberry', 'raspberries'], en: 'Raspberry.', bg: 'Малина.', tier: 'low' },
  { keys: ['blueberry', 'blueberries'], en: 'Blueberry.', bg: 'Боровинка.', tier: 'low' },
  { keys: ['almond', 'almonds'], en: 'Almonds.', bg: 'Бадеми.', tier: 'low' },
  { keys: ['hazelnut', 'hazelnuts'], en: 'Hazelnuts.', bg: 'Лешници.', tier: 'low' },
  { keys: ['walnut', 'walnuts'], en: 'Walnuts.', bg: 'Орехи.', tier: 'low' },
  { keys: ['peanut', 'peanuts'], en: 'Peanuts.', bg: 'Фъстъци.', tier: 'low' },
  { keys: ['cashew', 'cashews'], en: 'Cashews.', bg: 'Кашу.', tier: 'low' },
  { keys: ['sesame seed', 'sesame seeds', 'sesame'], en: 'Sesame seeds.', bg: 'Сусамово семе.', tier: 'low' },
  { keys: ['flax seed', 'flax seeds', 'linseed', 'linseeds'], en: 'Flax seeds.', bg: 'Ленено семе.', tier: 'low' },
  { keys: ['chia seed', 'chia seeds'], en: 'Chia seeds.', bg: 'Чиа семена.', tier: 'low' },
  { keys: ['sunflower seed', 'sunflower seeds'], en: 'Sunflower seeds.', bg: 'Слънчогледово семе.', tier: 'low' },
  { keys: ['pumpkin seed', 'pumpkin seeds'], en: 'Pumpkin seeds.', bg: 'Тиквено семе.', tier: 'low' },
  { keys: ['baking powder'], en: 'Baking powder — a raising agent for baked goods.', bg: 'Бакпулвер — набухвател за печива.', tier: 'low' },
  { keys: ['yeast', "baker's yeast", 'bakers yeast', 'active dry yeast'], en: "Yeast — the leavening organism in bread.", bg: 'Мая — микроорганизмът, който бухва хляба.', tier: 'low' },
  { keys: ['vinegar', 'wine vinegar', 'apple cider vinegar', 'cider vinegar', 'balsamic vinegar'], en: 'Vinegar.', bg: 'Оцет.', tier: 'low' },
  { keys: ['malt', 'malt extract', 'barley malt', 'malted barley'], en: 'Malt — sprouted, dried grain used for flavor and fermentation.', bg: 'Малц — покълнало, изсушено зърно, използвано за вкус и ферментация.', tier: 'low' },
  { keys: ['barley'], en: 'Barley.', bg: 'Ечемик.', tier: 'low' },
  { keys: ['breadcrumbs'], en: 'Breadcrumbs.', bg: 'Галета.', tier: 'low' },
];

const E_NUMBER_PATTERN = /\be[\s-]?(\d{3,4})[\s-]?([a-z]*)\b/i;

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[.,;:()]/g, '')
    // OFF taxonomy ids are hyphenated ("skimmed-milk"); glossary keys are
    // written as plain phrases ("skimmed milk"). Without this, every
    // multi-word id-based lookup silently misses.
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ');
}

interface GlossaryLookupResult {
  en: string;
  bg: string;
  tier: RiskTier;
  /** True for any entry keyed by an E-number — i.e. an additive, not a staple. */
  isAdditive: boolean;
  efsaConcern?: EfsaConcern;
}

const GLOSSARY: Record<string, GlossaryLookupResult> = {};
for (const entry of ENTRIES) {
  const isAdditive = entry.keys.some((key) => /^e\d{3,4}[a-z]?$/i.test(key));
  for (const key of entry.keys) {
    const normalized = /^e\d{3,4}[a-z]?$/i.test(key) ? key.toUpperCase() : normalizeName(key);
    GLOSSARY[normalized] = { en: entry.en, bg: entry.bg, tier: entry.tier, isAdditive, efsaConcern: entry.efsaConcern };
  }
}

function lookupOne(value: string): GlossaryLookupResult | null {
  const source = value.replace(/^[a-z]{2}:/i, '');

  const numberMatch = source.match(E_NUMBER_PATTERN);
  if (numberMatch) {
    const digits = numberMatch[1];
    const suffix = numberMatch[2];
    if (suffix) {
      const withSuffix = GLOSSARY[`E${digits}${suffix}`.toUpperCase()];
      if (withSuffix) return withSuffix;
    }
    // OFF's taxonomy splits some additives into numbered sub-variants (e.g.
    // "en:e500ii" for one specific carbonate salt within the E500 family)
    // that this glossary doesn't break out individually. The old pattern
    // only allowed a single trailing letter, so multi-letter roman-numeral
    // suffixes like "ii"/"iii" failed to match at all and fell through to
    // "unrated" even though the base E-number is covered. Falling back to
    // the base number gives a correct family-level rating instead.
    const base = GLOSSARY[`E${digits}`];
    if (base) return base;
  }

  return GLOSSARY[normalizeName(source)] ?? null;
}

const WHOLE_E_NUMBER = /^e[\s-]?\d{3,4}[\s-]?[a-z]*$/i;

/**
 * Whether the glossary knows this ingredient by its whole name (or as a bare
 * E-number). Stricter than `lookupIngredientInfo`, whose E-number pattern
 * matches anywhere in a longer string — used as a "this is a real ingredient"
 * signal by the ingredient sanitizer, so "Tel. E 1234 …" must not count.
 */
export function isKnownIngredient(ingredient: { id: string | null; text: string }): boolean {
  const known = (value: string) => {
    const source = value.replace(/^[a-z]{2}:/i, '').trim();
    if (source === '') return false;
    if (WHOLE_E_NUMBER.test(source)) return lookupOne(source) !== null;
    return GLOSSARY[normalizeName(source)] !== undefined;
  };
  return (ingredient.id !== null && known(ingredient.id)) || known(ingredient.text);
}

/**
 * Looks up a plain-language description and risk tier for an ingredient,
 * trying its OFF taxonomy id first (e.g. "en:skimmed-milk", "en:e330"), then
 * its raw display text — some taxonomy ids are more specific than the
 * glossary covers, but the free-text label still matches. Returns null when
 * neither matches — callers show the raw text as-is and badge the
 * ingredient as "unrated" then, never as "low".
 */
export function lookupIngredientInfo(
  ingredient: { id: string | null; text: string },
  lang: AppLanguage
): IngredientInfo | null {
  const entry = (ingredient.id ? lookupOne(ingredient.id) : null) ?? lookupOne(ingredient.text);
  if (!entry) return null;

  const concernNote: ConcernNote = !entry.isAdditive
    ? { status: 'not-applicable' }
    : entry.efsaConcern
      ? { status: 'sourced', ...entry.efsaConcern }
      : { status: 'not-found' };

  return { description: entry[lang], tier: entry.tier, concernNote };
}

/**
 * Every entry's `en`/`bg` field is either just a name ("Milk.") or a
 * "Name — longer description." sentence — the name is always the part
 * before the em dash. Used as a secondary source of a real, localized
 * ingredient display name (after Open Food Facts' own taxonomy, before
 * falling back to raw/untranslated text) for the ~300 ingredients this
 * dictionary covers.
 */
function extractGlossaryName(description: string): string {
  const dashIndex = description.indexOf(' — ');
  const namePart = dashIndex === -1 ? description : description.slice(0, dashIndex);
  return namePart.replace(/\.\s*$/, '').trim();
}

/**
 * Looks up a real, localized display name for an ingredient from this
 * dictionary — a fallback for when Open Food Facts' own taxonomy has no
 * translation for the requested language. Never returns a raw id or
 * anything derived from formatting one.
 */
export function lookupIngredientName(
  ingredient: { id: string | null; text: string },
  lang: AppLanguage
): string | null {
  const entry = (ingredient.id ? lookupOne(ingredient.id) : null) ?? lookupOne(ingredient.text);
  return entry ? extractGlossaryName(entry[lang]) : null;
}

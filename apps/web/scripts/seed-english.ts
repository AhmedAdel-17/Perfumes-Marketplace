import type { PGlite } from '@electric-sql/pglite';
import { foldArabic } from '@diyar/domain';

/**
 * The English half of the seed (P5.6.2 step 3, D-3).
 *
 * Kept apart from `seed.ts` because it runs in TWO situations: on a fresh seed,
 * and on a database seeded before English existed — the local database every
 * developer already has. The second is a BACKFILL: it only fills what is empty,
 * so it never overwrites an English name somebody has since typed in, and it can
 * run on every `dev` start at no cost.
 *
 * THE LEGAL PAGES ARE TRANSLATIONS, not a second contract. Each opens by saying
 * the Arabic governs. Counsel still has to review the Arabic (see the note in
 * seed.ts), and the English follows whatever they change.
 */

export const PRODUCT_NAMES_EN: Readonly<Record<string, string>> = {
  'layl-al-qahira': 'Cairo Night',
  'ward-al-taif': 'Taif Rose',
  nakhil: 'Palms of Siwa',
};

export const HOUSE_TEXT_EN: Readonly<Record<string, { bio: string; story: string }>> = {
  'maison-nour': {
    bio: 'A small perfume house in downtown Cairo that makes in limited batches and signs every bottle by name.',
    story: 'The house began in a flat above the perfumers\' market, with three bottles and a notebook.\n\nEvery formula is still mixed by hand and left to rest for weeks before it is bottled. That is why we show so few, and why we know who made each bottle.',
  },
  'dar-al-ward': {
    bio: 'From Alexandria. Light perfumes, made close to the harbour.',
    story: 'Humidity and salt change how a perfume behaves, and we learned that on the coast before we read it in a book.\n\nWe work with materials that stand up to heat, and we test every formula through a city summer before we show it.',
  },
  'atelier-siwa': {
    bio: 'An atelier between Siwa and Giza, specialising in desert oils and incense.',
    story: 'Our materials come from the oasis: dates, olives, and the palms of Siwa that gave one of our perfumes its name.\n\nWe buy directly from farmers we know by name, and we give the source of every material on the perfume\'s page.',
  },
};

/** English names for every note the seeded perfumes use. */
export const NOTES_EN: Readonly<Record<string, string>> = {
  'برغموت': 'Bergamot',
  'زعفران': 'Saffron',
  'هيل': 'Cardamom',
  'ورد دمشقي': 'Damask rose',
  'ياسمين': 'Jasmine',
  'عود': 'Oud',
  'عنبر': 'Amber',
  'مسك': 'Musk',
  'ليمون': 'Lemon',
  'ورد طائفي': 'Taif rose',
  'إيلنغ': 'Ylang-ylang',
  'خشب الصندل': 'Sandalwood',
  'نعناع': 'Mint',
  'ليمون أخضر': 'Lime',
  'نخيل': 'Palm',
  'شاي أخضر': 'Green tea',
  'مسك أبيض': 'White musk',
  'خشب الأرز': 'Cedarwood',
};

type Block =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'passage'; text: string }
  | { kind: 'pull_quote'; text: string; attribution: string }
  | { kind: 'note_list'; items: Array<{ term: string; detail: string }> }
  | { kind: 'divider' }
  | { kind: 'call_to_action'; label: string; href: string };

const TRANSLATION_NOTICE: Block = {
  kind: 'passage',
  text: 'This English text is a translation provided for convenience. If it differs from the Arabic, the Arabic version governs.',
};

export const PAGES_EN: Readonly<Record<string, { title: string; blocks: Block[] }>> = {
  about: {
    title: 'About DIYAR',
    blocks: [
      { kind: 'passage', text: 'DIYAR is a marketplace for independent Egyptian perfume.\n\nWe work with small houses that make in limited batches and prepare and ship every order themselves. No central warehouse, and no middleman between the house and you.' },
      { kind: 'heading', level: 2, text: 'Why independent houses' },
      { kind: 'passage', text: 'Egyptian perfume has a tradition older than the modern market, and most of it is sold today without a name. A house that puts its name on the bottle takes responsibility for it.' },
      { kind: 'pull_quote', text: 'What we sell is not only a perfume; it is someone\'s name on a bottle.', attribution: 'From the DIYAR charter' },
      { kind: 'divider' },
      { kind: 'heading', level: 2, text: 'How we work' },
      { kind: 'note_list', items: [
        { term: 'Preparation', detail: 'Every house prepares its own order and tells you when it ships.' },
        { term: 'Payment', detail: 'Cash on delivery on every order, for now.' },
        { term: 'Prices', detail: 'In Egyptian pounds, tax included, with delivery shown separately for each house.' },
      ] },
      { kind: 'call_to_action', label: 'Browse perfumes', href: '/' },
    ],
  },
  care: {
    title: 'Caring for perfume',
    blocks: [
      { kind: 'passage', text: 'Perfume is a living material that changes with heat and light. These rules add years to its life.' },
      { kind: 'heading', level: 2, text: 'Storage' },
      { kind: 'note_list', items: [
        { term: 'Heat', detail: 'Below 25 degrees. The bathroom is the worst place in the house.' },
        { term: 'Light', detail: 'Away from direct sun. The original box is enough.' },
        { term: 'Air', detail: 'Close the bottle well; oxygen changes the top notes first.' },
      ] },
      { kind: 'heading', level: 3, text: 'The fridge' },
      { kind: 'passage', text: 'Not necessary, and not harmful. What matters is a steady temperature, not a low one.' },
      { kind: 'call_to_action', label: 'Track your order', href: '/order' },
    ],
  },
  terms: {
    title: 'Terms of sale',
    blocks: [
      TRANSLATION_NOTICE,
      { kind: 'passage', text: 'These terms govern buying from DIYAR. Read them before you order; by confirming an order you agree to them.\n\nLast updated: September 2026.' },
      { kind: 'heading', level: 2, text: 'Who sells to you' },
      { kind: 'passage', text: 'DIYAR is a marketplace, not a manufacturer or an importer. Every perfume you buy is sold by an independent house that puts its name on the bottle, and that house is responsible for the product, its preparation and its shipping.\n\nDIYAR\'s role is to show it, collect the payment, and settle disputes when they happen. The house\'s name is on every perfume page and in every order.' },
      { kind: 'heading', level: 2, text: 'Prices and payment' },
      { kind: 'note_list', items: [
        { term: 'Currency', detail: 'All prices are in Egyptian pounds and include VAT.' },
        { term: 'Delivery', detail: 'Charged separately for each house and shown in the bag before you confirm. An order from two houses means two parcels and two delivery charges.' },
        { term: 'Payment', detail: 'Cash on delivery only, for now. We do not ask for or store card details.' },
        { term: 'Binding price', detail: 'The binding price is the one on the order confirmation page. If it differs from a price you saw earlier, we show you the difference and do not complete the order without your agreement.' },
      ] },
      { kind: 'heading', level: 2, text: 'Preparation and delivery' },
      { kind: 'passage', text: 'The house confirms the order within the time stated on its page, then prepares it and hands it to the courier. You receive a message with the tracking number when it leaves.\n\nDelivery times are estimates, not a contractual promise: shipping in Egypt is affected by holidays, traffic and incomplete addresses. If your order is more than three working days later than stated, contact us and we will follow it up for you.' },
      { kind: 'heading', level: 2, text: 'Cancellation and returns' },
      { kind: 'passage', text: 'You can cancel an order before it leaves the house at no charge. After it ships, the returns policy applies.' },
      { kind: 'call_to_action', label: 'Read the returns policy', href: '/returns' },
      { kind: 'heading', level: 2, text: 'What we do not sell' },
      { kind: 'passage', text: 'We do not show perfumes presented as an imitation or copy of another house, and we do not allow a claim of agency or licence the house does not hold. Every product is reviewed before it is published, and a prohibited claim is refused and the product withdrawn.' },
      { kind: 'heading', level: 2, text: 'Reviews' },
      { kind: 'passage', text: 'Only someone who actually received the product through DIYAR can review it. We do not buy reviews and we do not remove a review for being bad. We hide what contains abuse, personal data or unlawful content, and we record why.' },
      { kind: 'heading', level: 2, text: 'Limitation of liability' },
      { kind: 'passage', text: 'Our liability for any order does not exceed the amount paid for it. This does not affect your rights under Consumer Protection Law No. 181 of 2018, and does not relieve anyone of liability for fraud or gross harm.\n\nPerfume is a substance that touches the skin. Test any new perfume on a small area first, and do not use it on irritated skin. If an allergic reaction appears, stop using it and see a doctor.' },
      { kind: 'heading', level: 2, text: 'Law and jurisdiction' },
      { kind: 'passage', text: 'These terms are governed by Egyptian law, and the courts of Cairo have jurisdiction over any dispute about them.' },
      { kind: 'divider' },
      { kind: 'passage', text: 'For any question about these terms, write to us.' },
      { kind: 'call_to_action', label: 'Contact us', href: '/support' },
    ],
  },
  returns: {
    title: 'Returns policy',
    blocks: [
      TRANSLATION_NOTICE,
      { kind: 'passage', text: 'Perfume touches the skin, and an opened bottle does not go back into stock. So our policy rests on one clear distinction: is it a fault, or a change of mind?' },
      { kind: 'heading', level: 2, text: 'If there is a fault' },
      { kind: 'passage', text: 'A fault is always accepted, whatever the house\'s own policy, and nothing on this page takes that right away. You have 30 days from delivery to request a return in these cases:' },
      { kind: 'note_list', items: [
        { term: 'It arrived broken or damaged', detail: 'Photograph the package as it arrived, if you can. The cost falls on the courier.' },
        { term: 'You received a different product', detail: 'The cost falls on the house, and shipping is free both ways.' },
        { term: 'It does not match the written description', detail: 'The cost falls on the house. This means a real difference in size, concentration or ingredients, not a difference of taste.' },
        { term: 'It has a manufacturing fault', detail: 'A spray that does not work, a leak, or a changed scent. The cost falls on the house.' },
      ] },
      { kind: 'heading', level: 2, text: 'If you change your mind' },
      { kind: 'passage', text: 'You have 14 days from delivery, the period set for distance selling. Two conditions:\n\nThe bottle must be sealed and unopened, and the house\'s policy must allow it — it is stated on every perfume page before you buy.\n\nIn this case, shipping both ways is at your cost and is deducted from the refund.' },
      { kind: 'heading', level: 2, text: 'How a return works' },
      { kind: 'note_list', items: [
        { term: 'Request it', detail: 'From the order tracking page: enter the order number and your mobile number, then choose the product and the reason.' },
        { term: 'Wait for the house', detail: 'The house reviews the request and approves or declines it, giving the reason.' },
        { term: 'Hand it over', detail: 'We arrange collection. Pack it as it arrived, as far as you can.' },
        { term: 'Inspection', detail: 'The bottle is inspected within 48 hours of reaching us.' },
        { term: 'Refund', detail: 'Within 7 working days of inspection. Nothing is refunded before the bottle reaches us.' },
      ] },
      { kind: 'pull_quote', text: 'We do not refund on a promise. The bottle arrives, it is inspected, then the money is returned.', attribution: 'From the DIYAR policy' },
      { kind: 'heading', level: 2, text: 'What is not accepted' },
      { kind: 'note_list', items: [
        { term: 'An opened bottle, for a change of mind', detail: 'It cannot be resold or returned to stock.' },
        { term: 'After the deadline', detail: '14 days for a change of mind and 30 days for a fault, from delivery.' },
        { term: 'Damage after delivery', detail: 'A break or damage that happened after the parcel reached you.' },
      ] },
      { kind: 'divider' },
      { kind: 'call_to_action', label: 'Start from the order tracking page', href: '/order' },
    ],
  },
  privacy: {
    title: 'Privacy',
    blocks: [
      TRANSLATION_NOTICE,
      { kind: 'passage', text: 'This page explains what we collect about you, why, who sees it, and how to ask for it to be deleted. It is written to be read, not skipped.\n\nLast updated: September 2026.' },
      { kind: 'heading', level: 2, text: 'What we collect' },
      { kind: 'note_list', items: [
        { term: 'Mobile number', detail: 'It is your identity with us. It opens your order, lets you track it, and is how the courier reaches you.' },
        { term: 'Name and address', detail: 'Only to deliver the order. They are copied onto the parcel so it reaches the house and the courier.' },
        { term: 'What you ordered', detail: 'What you bought and what you paid. Needed for the invoice, the accounts and returns.' },
        { term: 'What you write to us', detail: 'Support messages, return requests and reviews.' },
      ] },
      { kind: 'passage', text: 'We collect no card details, because payment is cash on delivery. We do not ask for a national ID number, a date of birth or a photograph.' },
      { kind: 'heading', level: 2, text: 'Who sees what' },
      { kind: 'note_list', items: [
        { term: 'The house', detail: 'Sees what you bought from it, and your name, address and number to deliver it. It does not see what you bought from another house, or your order history.' },
        { term: 'The courier', detail: 'Sees the name, the address, the number and the amount to collect.' },
        { term: 'The DIYAR team', detail: 'Sees what is needed to solve your problem, and every administrative access is logged.' },
        { term: 'Anyone else', detail: 'No. We do not sell, rent or share your data for advertising.' },
      ] },
      { kind: 'heading', level: 2, text: 'Reviews' },
      { kind: 'passage', text: 'Your review shows your first name and one letter of your surname — "Laila M." — and never your number, your address or anything else you bought.' },
      { kind: 'heading', level: 2, text: 'How long we keep it' },
      { kind: 'passage', text: 'Order data is kept for seven years, the period commercial and tax law require us to keep our books.\n\nSupport messages are kept for two years. Anonymous browsing records are kept for 180 days.' },
      { kind: 'heading', level: 2, text: 'Your rights' },
      { kind: 'passage', text: 'You can ask for a copy of your data, or for it to be corrected or deleted. We reply within 30 days.\n\nWhat we cannot delete is what the law requires us to keep: the invoice for an order that took place stays in the books until its legal period ends. We delete everything else.' },
      { kind: 'call_to_action', label: 'Request or delete your data', href: '/support' },
      { kind: 'heading', level: 2, text: 'Security' },
      { kind: 'passage', text: 'Access to data is restricted by role: every house sees only its own rows, and the restriction is enforced in the database itself, not in the interface. The connection to the site is fully encrypted.' },
      { kind: 'divider' },
      { kind: 'passage', text: 'For any question about your privacy, or to make a complaint, write to us and we will reply.' },
      { kind: 'call_to_action', label: 'Contact us', href: '/support' },
    ],
  },
};

/**
 * Fills the English half wherever it is empty. Safe to run on every start.
 *
 * A CMS page's published revision is immutable (0009), so an existing page
 * gains its English the way an editor would add it: the draft is updated and a
 * NEW revision is published carrying both halves.
 */
export async function seedEnglish(pg: PGlite, staffId: string): Promise<void> {
  let filled = 0;

  for (const [slug, nameEn] of Object.entries(PRODUCT_NAMES_EN)) {
    const updated = await pg.query(
      `UPDATE products SET name_en = $2, search_text = search_text || ' ' || $3
       WHERE slug = $1 AND name_en IS NULL`,
      [slug, nameEn, foldArabic(nameEn)]);
    filled += updated.affectedRows ?? 0;
  }

  for (const [slug, text] of Object.entries(HOUSE_TEXT_EN)) {
    const updated = await pg.query(
      `UPDATE sellers SET bio_en = $2, story_en = $3 WHERE slug = $1 AND bio_en IS NULL AND story_en IS NULL`,
      [slug, text.bio, text.story]);
    filled += updated.affectedRows ?? 0;
  }

  for (const [ar, en] of Object.entries(NOTES_EN)) {
    const inserted = await pg.query(
      `INSERT INTO note_glossary (ar, en, updated_by) VALUES ($1,$2,$3) ON CONFLICT (ar) DO NOTHING`,
      [ar, en, staffId]);
    filled += inserted.affectedRows ?? 0;
  }

  for (const [slug, page] of Object.entries(PAGES_EN)) {
    const live = (await pg.query<{ id: string; title: string; blocks: unknown; blocks_en: unknown[] }>(
      `SELECT p.id, r.title, r.blocks, r.blocks_en
       FROM content_pages p JOIN content_revisions r ON r.id = p.published_revision_id
       WHERE p.slug = $1`, [slug])).rows[0];
    if (!live || (Array.isArray(live.blocks_en) && live.blocks_en.length > 0)) continue;

    await pg.query(
      `UPDATE content_pages SET title_en = $2, draft_blocks_en = $3::jsonb
       WHERE id = $1 AND jsonb_array_length(draft_blocks_en) = 0`,
      [live.id, page.title, JSON.stringify(page.blocks)]);
    const revision = (await pg.query<{ id: string }>(
      `INSERT INTO content_revisions (page_id, title, blocks, title_en, blocks_en, published_by)
       VALUES ($1,$2,$3::jsonb,$4,$5::jsonb,$6) RETURNING id`,
      [live.id, live.title, JSON.stringify(live.blocks), page.title, JSON.stringify(page.blocks), staffId],
    )).rows[0]!.id;
    await pg.query(`UPDATE content_pages SET published_revision_id = $2 WHERE id = $1`, [live.id, revision]);
    filled += 1;
  }

  if (filled > 0) console.log(`· English content: filled ${filled} empty field(s)`);
}

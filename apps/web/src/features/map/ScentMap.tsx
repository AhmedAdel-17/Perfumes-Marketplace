'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  NOTE_TIERS, SCENT_WHEEL, scentMap,
  type NoteIcon, type NoteTier, type ScentFamily,
} from '@diyar/domain';
import { glassPalette } from '@diyar/tokens';
import {
  CURRENCY_LABEL, formatPrice, langAttrs, labelOf, MAP, PRODUCT, SCENT_FAMILY, data as num, type Locale,
} from '@diyar/i18n';
import { NoteIconMark } from '@/features/catalogue/NoteChip';
import { localeHref } from '@/core/href';
import { prefersStill } from '@/features/motion/motion';
import { RADII, facing, hash, layoutMap, thread, TAU } from './layout';
import { SkyController } from './sky-controller';

/**
 * LA CARTE OLFACTIVE — the catalogue as a night sky, drawn as an astrolabe
 * (founder 19 Oct 2026; design-reference/experiences/03-carte-olfactive.html).
 * The seven families are the sectors of the wheel, ordered as a perfumer's
 * wheel is; every perfume stands in its family; every note is a star in the
 * family it belongs to by nature; threads join each perfume to its notes.
 *
 * The sky is the picture; the PANEL is the map's words, and it is the whole of
 * the map for anyone who cannot use the picture: the families as buttons, then
 * a family's perfumes and notes, a perfume's notes, a note's perfumes — every
 * one a real control of full size. So the sky itself is hidden from assistive
 * technology, and a press on it (a star, a perfume, a sector) simply opens the
 * same panel view.
 *
 * Dark in both themes, as the reveal's room is: a night sky on paper would be
 * a diagram. `data-theme="dark"` scopes every role inside, and `text-ink` is
 * restated (DESIGN_DOCTRINE §7).
 */
export interface MapPerfume {
  readonly id: string;
  readonly slug: string;
  readonly name: { readonly text: string; readonly lang: Locale };
  readonly house: { readonly text: string; readonly lang: Locale };
  readonly brandLatin: string;
  readonly family: string;
  readonly pricePiastres: number;
  /** A small copy of its cut-out (transparent) or, failing that, its photograph. */
  readonly image: { readonly src: string; readonly cutout: boolean } | null;
  readonly notes: Readonly<Record<NoteTier, readonly string[]>>;
}

export interface MapWord {
  readonly note: string;
  readonly shown: { readonly text: string; readonly lang: Locale };
  /** The English name, for the star's second line. */
  readonly en: string | null;
  readonly icon: NoteIcon | null;
  readonly family: ScentFamily | null;
}

type Chosen = { kind: 'perfume' | 'note' | 'family'; id: string } | null;

export function ScentMap({ perfumes, words, locale }: { perfumes: readonly MapPerfume[]; words: readonly MapWord[]; locale: Locale }) {
  const copy = MAP[locale];
  const product = PRODUCT[locale];
  /*
   * Keyed by CONTENT. The first event of a visit (`scent_map_view`) sets the
   * visitor's cookie and Next refreshes the page: new prop objects, the same
   * catalogue. Keyed by identity, the sky was rebuilt and jumped back to where
   * it started (the dial had the same fault, 20 Oct 2026).
   */
  const key = JSON.stringify([perfumes.map((p) => [p.id, p.family, p.notes, p.image?.src ?? null]), words.map((w) => [w.note, w.family, w.icon, w.en])]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `words`
  const word = useMemo(() => new Map(words.map((w) => [w.note, w])), [key]);
  const graph = useMemo(
    () => scentMap(perfumes.map((p) => ({ id: p.id, family: p.family, notes: p.notes })), (note) => word.get(note)?.family ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `perfumes`
    [key, word],
  );
  const { sectors, stars, planets } = useMemo(() => layoutMap(graph), [graph]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `perfumes`
  const byId = useMemo(() => new Map(perfumes.map((p) => [p.id, p])), [key]);
  const starOf = useMemo(() => new Map(stars.map((s) => [s.note, s])), [stars]);
  const planetOf = useMemo(() => new Map(planets.map((p) => [p.id, p])), [planets]);
  const links = useMemo(() => graph.notes.flatMap((n) => n.carriedBy.map((c) => ({ note: n.note, perfumeId: c.perfumeId }))), [graph]);
  const familyWord = (f: string) => labelOf(SCENT_FAMILY, locale, f);
  const mist = (f: string) => glassPalette(f).mist;

  const [hover, setHover] = useState<Chosen>(null);
  const [chosen, setChosen] = useState<Chosen>(null);
  const svg = useRef<SVGSVGElement>(null);
  const wheel = useRef<SVGGElement>(null);
  const field = useRef<SVGGElement>(null);
  const uprightEls = useRef(new Map<string, SVGGElement>());
  const labelEls = useRef(new Map<string, SVGGElement>());
  const sky = useRef<SkyController | null>(null);

  const choose = (next: Chosen) => {
    // The control pressed may leave the page with the view it belonged to, and
    // a control that is gone never reports the pointer leaving it.
    setHover(null);
    setChosen(next);
    if (next?.kind === 'family') sky.current?.spinTo(facing(next.id as ScentFamily));
  };

  useEffect(() => {
    if (!svg.current || !wheel.current || !field.current) return;
    const uprights = [...uprightEls.current].map(([slot, el]) => {
      const [kind, id] = slot.split('|') as [string, string];
      const at = kind === 'star' ? starOf.get(id) : kind === 'planet' ? planetOf.get(id) : sectorLabel(id);
      return { el, x: at?.x ?? 0, y: at?.y ?? 0 };
    });
    const labels = [...labelEls.current].map(([note, el]) => ({ el, a: starOf.get(note)?.a ?? 0 }));
    const controller = new SkyController(
      { svg: svg.current, wheel: wheel.current, field: field.current, uprights, labels },
      prefersStill(),
      (target) => {
        const kind = target?.getAttribute('data-kind'), id = target?.getAttribute('data-id');
        if (kind && id && (kind === 'perfume' || kind === 'note' || kind === 'family')) choose({ kind, id });
      },
    );
    sky.current = controller;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setChosen(null); setHover(null); } };
    document.addEventListener('keydown', escape);
    return () => { controller.dispose(); sky.current = null; document.removeEventListener('keydown', escape); };
    // The sky is drawn once per catalogue; the controller reads the same layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starOf, planetOf]);

  // ------------------------------------------------------------------ what is lit
  const lit = useMemo(() => {
    const h = hover ?? chosen;
    const p = new Set<string>(), n = new Set<string>(), f = new Set<string>(), l = new Set<string>();
    if (h?.kind === 'perfume') {
      p.add(h.id);
      const fam = byId.get(h.id)?.family;
      if (fam) f.add(fam);
      for (const link of links) if (link.perfumeId === h.id) { n.add(link.note); l.add(`${link.perfumeId}|${link.note}`); }
    } else if (h?.kind === 'note') {
      n.add(h.id);
      for (const link of links) if (link.note === h.id) { p.add(link.perfumeId); l.add(`${link.perfumeId}|${link.note}`); }
    } else if (h?.kind === 'family') {
      f.add(h.id);
      for (const fam of graph.families) if (fam.family === h.id) { fam.perfumes.forEach((id) => p.add(id)); fam.notes.forEach((x) => n.add(x)); }
      for (const link of links) if (byId.get(link.perfumeId)?.family === h.id) l.add(`${link.perfumeId}|${link.note}`);
    }
    return { any: !!h, p, n, f, l, h };
  }, [hover, chosen, links, byId, graph]);

  const centre = lit.h?.kind === 'family'
    ? [familyWord(lit.h.id), copy.familyCentre(labelOf(SCENT_FAMILY, 'en', lit.h.id).toUpperCase(), graph.families.find((x) => x.family === lit.h!.id)?.perfumes.length ?? 0)]
    : [copy.title, copy.centre(planets.length, stars.length)];

  // ------------------------------------------------------------------ the panel
  const shownNote = (note: string) => word.get(note)?.shown ?? { text: note, lang: 'ar' as Locale };
  const noteButton = (note: string) => {
    const w = shownNote(note), fam = word.get(note)?.family ?? 'amber';
    return (
      <button key={note} type="button" onClick={() => choose({ kind: 'note', id: note })} className="map-chip tappable" style={{ ['--c' as string]: mist(fam) }}>
        <NoteIconMark icon={word.get(note)?.icon ?? null} className="map-chip-icon" />
        <span {...langAttrs(locale, w.lang)}>{w.text}</span>
      </button>
    );
  };
  const perfumeRow = (id: string) => {
    const p = byId.get(id);
    if (!p) return null;
    return (
      <li key={id}>
        <button type="button" onClick={() => choose({ kind: 'perfume', id })} className="map-row tappable">
          {p.image ? <img src={p.image.src} alt="" className={p.image.cutout ? 'map-row-image' : 'map-row-image map-row-photo'} /> : <span className="map-row-image" />}
          <span className="min-w-0">
            <span {...langAttrs(locale, p.name.lang)} className="block font-display text-bodyLg leading-heading">{p.name.text}</span>
            <span className="latin block text-micro tracking-label text-ink3">{p.brandLatin}</span>
          </span>
          <span className="ms-auto shrink-0 text-small"><span className="tnum">{formatPrice(p.pricePiastres)}</span> <span className="latin text-micro text-ink2">{CURRENCY_LABEL}</span></span>
        </button>
      </li>
    );
  };

  let view: React.ReactNode;
  if (chosen?.kind === 'perfume' && byId.has(chosen.id)) {
    const p = byId.get(chosen.id)!;
    view = (
      <>
        <button type="button" onClick={() => choose(null)} className="map-back tappable">{copy.back}</button>
        <div className="map-figure" style={{ ['--c' as string]: mist(p.family) }}>
          {p.image && <img src={p.image.src} alt={p.name.text} className={p.image.cutout ? undefined : 'map-figure-photo'} />}
        </div>
        <span className="latin text-micro tracking-label text-accent">{p.brandLatin}</span>
        <h2 {...langAttrs(locale, p.name.lang)} className="font-display text-h2 leading-heading lg:text-h1">{p.name.text}</h2>
        <p {...langAttrs(locale, p.house.lang)} className="-mt-2 text-body text-ink2">{p.house.text}</p>
        <dl className="map-facts">
          {NOTE_TIERS.map((tier) => p.notes[tier].length > 0 && (
            <div key={tier} className="map-fact">
              <dt>{tier === 'top' ? product.topNotes : tier === 'heart' ? product.heartNotes : product.baseNotes}</dt>
              <dd className="flex flex-wrap gap-x-1 gap-y-1">{p.notes[tier].map((note) => (starOf.has(note) ? noteButton(note) : (
                <span key={note} className="map-chip map-chip-plain"><NoteIconMark icon={word.get(note)?.icon ?? null} className="map-chip-icon" /><span {...langAttrs(locale, shownNote(note).lang)}>{shownNote(note).text}</span></span>
              )))}</dd>
            </div>
          ))}
          <div className="map-fact"><dt>{copy.family}</dt><dd>{familyWord(p.family)}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <Link href={localeHref(locale, `/p/${p.slug}`)} className="map-action map-action-solid tappable">
            {copy.open} · <span className="tnum">{formatPrice(p.pricePiastres)}</span> <span className="latin text-micro">{CURRENCY_LABEL}</span>
          </Link>
          <Link href={`${localeHref(locale, `/p/${p.slug}`)}#day`} className="map-action tappable">{copy.day}</Link>
        </div>
      </>
    );
  } else if (chosen?.kind === 'note' && starOf.has(chosen.id)) {
    const note = chosen.id, w = shownNote(note), entry = graph.notes.find((x) => x.note === note)!;
    const fam = entry.family;
    const places = copy.join(entry.carriedBy.map((c) => {
      const p = byId.get(c.perfumeId);
      return p ? copy.inTier[c.tier](p.name.text) : '';
    }).filter(Boolean));
    view = (
      <>
        <button type="button" onClick={() => choose(null)} className="map-back tappable">{copy.back}</button>
        <span className="latin text-micro tracking-label" style={{ color: mist(fam) }}>{(word.get(note)?.en ?? '').toUpperCase()}{word.get(note)?.en ? ' · ' : ''}{labelOf(SCENT_FAMILY, 'en', fam).toUpperCase()}</span>
        <h2 className="flex items-center gap-3 font-display text-h2 leading-heading lg:text-h1">
          <span style={{ color: mist(fam) }} className="inline-flex"><NoteIconMark icon={word.get(note)?.icon ?? null} className="h-[34px] w-[34px]" /></span>
          <span {...langAttrs(locale, w.lang)}>{w.text}</span>
        </h2>
        <p className="text-body leading-relaxed text-ink2">{copy.noteStory(familyWord(fam), num(entry.carriedBy.length), places)}</p>
        <ul className="map-list">{[...new Set(entry.carriedBy.map((c) => c.perfumeId))].map(perfumeRow)}</ul>
      </>
    );
  } else if (chosen?.kind === 'family') {
    const fam = graph.families.find((x) => x.family === chosen.id);
    view = fam && (
      <>
        <button type="button" onClick={() => choose(null)} className="map-back tappable">{copy.back}</button>
        <span className="latin text-micro tracking-label" style={{ color: mist(fam.family) }}>{labelOf(SCENT_FAMILY, 'en', fam.family).toUpperCase()}</span>
        <h2 className="font-display text-h2 leading-heading lg:text-h1">{familyWord(fam.family)}</h2>
        <p className="text-body leading-relaxed text-ink2">
          {fam.perfumes.length ? copy.familyStory(num(fam.perfumes.length), copy.join(fam.notes.map((n) => shownNote(n).text))) : copy.familyEmpty}
        </p>
        {fam.notes.length > 0 && <div className="flex flex-wrap gap-1">{fam.notes.map(noteButton)}</div>}
        {fam.perfumes.length > 0 && <ul className="map-list">{fam.perfumes.map(perfumeRow)}</ul>}
      </>
    );
  } else {
    view = (
      <>
        <span className="latin text-micro tracking-label text-accent">{copy.kicker}</span>
        <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">{copy.title}</h1>
        <p className="max-w-[36ch] text-body leading-relaxed text-ink2 lg:text-bodyLg">{copy.lede}</p>
        <ul className="map-legend">
          {SCENT_WHEEL.map((fam) => {
            const count = graph.families.find((x) => x.family === fam)?.perfumes.length ?? 0;
            return (
              <li key={fam}>
                <button
                  type="button"
                  onClick={() => choose({ kind: 'family', id: fam })}
                  onPointerEnter={() => setHover({ kind: 'family', id: fam })}
                  onPointerLeave={() => setHover(null)}
                  className="map-legend-item tappable"
                  style={{ ['--c' as string]: mist(fam) }}
                >
                  <i aria-hidden="true" className="map-dot" />
                  {familyWord(fam)}
                  <span className="latin tnum ms-auto text-micro text-ink3">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="flex flex-wrap gap-3 text-small text-ink3"><span>{copy.howto}</span><span className="latin text-micro">{copy.howtoLatin}</span></p>
      </>
    );
  }

  // ------------------------------------------------------------------ the sky
  const upright = (key: string) => (el: SVGGElement | null) => { if (el) uprightEls.current.set(key, el); else uprightEls.current.delete(key); };
  const sectorLabel = (family: string) => {
    const s = sectors.find((x) => x.family === family);
    const a = s ? s.mid : 0;
    return { x: Math.cos(a) * RADII.labels, y: Math.sin(a) * RADII.labels };
  };
  const item = (kind: 'perfume' | 'note' | 'family', id: string) => ({
    'data-kind': kind,
    'data-id': id,
    onPointerEnter: () => setHover({ kind, id }),
    onPointerLeave: () => setHover(null),
  });

  return (
    <div data-theme="dark" className="map bg-ground text-ink">
      <div className="map-inner">
        <aside aria-live="polite" className="map-panel">
          <div key={chosen ? `${chosen.kind}:${chosen.id}` : 'all'} className="map-view">{view}</div>
        </aside>

        <div className="map-sky-wrap">
          <svg ref={svg} viewBox="-440 -440 880 880" aria-hidden="true" className="map-sky">
            <defs>
              {SCENT_WHEEL.map((f) => (
                <radialGradient key={f} id={`map-glow-${f}`}>
                  <stop offset="0" stopColor={mist(f)} stopOpacity={0.5} />
                  <stop offset="1" stopColor={mist(f)} stopOpacity={0} />
                </radialGradient>
              ))}
            </defs>
            {/* The far field: hashed, so the same sky every visit. */}
            <g ref={field}>
              {Array.from({ length: 230 }, (_, i) => {
                const a = hash(`a${i}`) * TAU, r = Math.sqrt(hash(`r${i}`)) * 440;
                return (
                  <circle
                    key={i}
                    cx={(Math.cos(a) * r).toFixed(1)}
                    cy={(Math.sin(a) * r).toFixed(1)}
                    r={(0.35 + hash(`s${i}`) * 0.9).toFixed(2)}
                    opacity={(0.18 + hash(`o${i}`) * 0.45).toFixed(2)}
                    className="map-far"
                    style={{ animationDelay: `${(-hash(`d${i}`) * 5).toFixed(2)}s` }}
                  />
                );
              })}
            </g>
            <g ref={wheel}>
              {sectors.map((s) => {
                const p = (r: number, a: number) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
                const d = `M${p(RADII.hub, s.a0)}L${p(RADII.rim, s.a0)}A${RADII.rim} ${RADII.rim} 0 0 1 ${p(RADII.rim, s.a1)}L${p(RADII.hub, s.a1)}A${RADII.hub} ${RADII.hub} 0 0 0 ${p(RADII.hub, s.a0)}Z`;
                return (
                  <g key={s.family}>
                    <path d={d} {...item('family', s.family)} className={lit.f.has(s.family) ? 'map-wedge map-lit' : 'map-wedge'} style={{ ['--glow' as string]: mist(s.family) }} />
                    <line x1={(Math.cos(s.a0) * RADII.hub).toFixed(2)} y1={(Math.sin(s.a0) * RADII.hub).toFixed(2)} x2={(Math.cos(s.a0) * RADII.limb).toFixed(2)} y2={(Math.sin(s.a0) * RADII.limb).toFixed(2)} className="map-sep" />
                  </g>
                );
              })}
              <circle r={RADII.hub} className="map-ring" />
              <circle r={240} className="map-ring map-ring-dash" />
              <circle r={RADII.rim} className="map-ring" />
              <circle r={RADII.limb} className="map-ring" />
              {/* The limb: an astrolabe's graduated rim, every three degrees. */}
              {Array.from({ length: 120 }, (_, k) => {
                const a = (k / 120) * TAU, major = k % 5 === 0, r0 = major ? 364 : 368;
                return <line key={k} x1={(Math.cos(a) * r0).toFixed(2)} y1={(Math.sin(a) * r0).toFixed(2)} x2={(Math.cos(a) * 376).toFixed(2)} y2={(Math.sin(a) * 376).toFixed(2)} className={major ? 'map-limb map-limb-major' : 'map-limb'} />;
              })}
              {/* Every perfume to every one of its notes: faint, always there; lit when chosen. */}
              <g>
                {links.map((link) => {
                  const from = planetOf.get(link.perfumeId), to = starOf.get(link.note);
                  if (!from || !to) return null;
                  const key = `${link.perfumeId}|${link.note}`, on = lit.l.has(key);
                  return (
                    <path
                      key={key}
                      d={thread(from, to)}
                      pathLength={1}
                      className={on ? 'map-thread map-thread-on' : lit.any ? 'map-thread map-dim' : 'map-thread'}
                      style={{ ['--glow' as string]: mist(byId.get(link.perfumeId)?.family ?? 'amber') }}
                    />
                  );
                })}
              </g>
              {stars.map((s) => {
                const w = word.get(s.note);
                const on = lit.n.has(s.note);
                return (
                  <g key={s.note} {...item('note', s.note)} className={on ? 'map-star map-lit' : lit.any ? 'map-star map-dim' : 'map-star'} style={{ ['--glow' as string]: mist(s.family) }}>
                    <circle cx={s.x} cy={s.y} r={26} className="map-hit" />
                    <circle cx={s.x} cy={s.y} r={8} className="map-halo" />
                    <circle cx={s.x} cy={s.y} r={2.4} className="map-core" />
                    <g ref={upright(`star|${s.note}`)} transform={`translate(${s.x.toFixed(2)} ${s.y.toFixed(2)})`}>
                      <g ref={(el) => { if (el) labelEls.current.set(s.note, el); else labelEls.current.delete(s.note); }} className="map-label">
                        <text className="map-label-ar">{w?.shown.text ?? s.note}</text>
                        {w?.en && <text dy={13} className="map-label-en">{w.en.toUpperCase()}</text>}
                      </g>
                    </g>
                  </g>
                );
              })}
              {planets.map((pl) => {
                const p = byId.get(pl.id);
                if (!p) return null;
                const on = lit.p.has(pl.id);
                return (
                  <g key={pl.id} {...item('perfume', pl.id)} className={on ? 'map-planet map-lit' : lit.any ? 'map-planet map-dim' : 'map-planet'} style={{ ['--glow' as string]: mist(pl.family) }}>
                    <g ref={upright(`planet|${pl.id}`)} transform={`translate(${pl.x.toFixed(2)} ${pl.y.toFixed(2)})`}>
                      <g transform={`scale(${pl.scale.toFixed(3)})`}>
                        <circle r={58} fill={`url(#map-glow-${pl.family})`} className="map-glow" />
                        <circle r={44} className="map-aura" />
                        <circle r={46} className="map-hit" />
                        <g className="map-body">
                          {p.image && (p.image.cutout
                            ? <image href={p.image.src} x={-36} y={-40} width={72} height={72} preserveAspectRatio="xMidYMid meet" />
                            : <>
                                <clipPath id={`map-clip-${pl.id}`}><circle r={30} /></clipPath>
                                <image href={p.image.src} x={-30} y={-30} width={60} height={60} preserveAspectRatio="xMidYMid slice" clipPath={`url(#map-clip-${pl.id})`} />
                              </>)}
                        </g>
                        <text y={54} className="map-name">{p.name.text}</text>
                      </g>
                    </g>
                  </g>
                );
              })}
              {sectors.map((s) => {
                const at = sectorLabel(s.family);
                const empty = !(graph.families.find((x) => x.family === s.family)?.perfumes.length);
                return (
                  <g key={s.family} ref={upright(`family|${s.family}`)} transform={`translate(${at.x.toFixed(2)} ${at.y.toFixed(2)})`} className={empty ? 'map-family map-family-empty' : 'map-family'} style={{ ['--glow' as string]: mist(s.family) }}>
                    <text y={2} className="map-family-ar">{familyWord(s.family)}</text>
                    <text y={17} className="map-family-en">{labelOf(SCENT_FAMILY, 'en', s.family).toUpperCase()}</text>
                  </g>
                );
              })}
            </g>
            <g className="map-centre">
              <text y={-4} className="map-centre-ar">{centre[0]}</text>
              <text y={20} className="map-centre-en">{centre[1]}</text>
            </g>
          </svg>
          {/* The Latin label beside the Arabic; in English it would only say the same words twice. */}
          <p aria-hidden="true" className="map-hint"><span>{copy.hint}</span>{locale === 'ar' && <span className="latin">{copy.hintLatin}</span>}</p>
        </div>
      </div>
    </div>
  );
}

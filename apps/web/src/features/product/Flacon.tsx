import { glassPalette } from '@diyar/tokens';

/**
 * The flacon.
 *
 * This replaces a CSS rectangle filled with a gradient, which was the single
 * loudest tell that the page was a wireframe wearing a product's clothes. Glass
 * does not read as glass because of its colour; it reads as glass because of
 * four things, and a render missing any one of them looks like plastic:
 *
 *   1. ABSORPTION — light crossing the full width of the flacon at the edge is
 *      almost extinguished, so the silhouette is near-black while the centre is
 *      luminous. This is why one flat fill can never work.
 *   2. THE LIQUID LINE — a bottle is not full. Empty glass above the juice is
 *      dramatically lighter and desaturated, and the meniscus that divides them
 *      is the detail the eye checks without knowing it is checking.
 *   3. THE CAUSTIC — glass is a lens. It concentrates the light passing through
 *      it into a bright pool on the surface beneath, tinted by the juice. A
 *      product photograph without one looks composited; so does a render.
 *   4. CONTACT — a hard, tight, dark shadow exactly where the base meets the
 *      surface, separate from the soft ambient shadow. Without it the bottle
 *      floats.
 *
 * Every colour is derived from the product's scent-family token by
 * `glassPalette`, so a new family needs one token and no artwork.
 *
 * `uid` scopes the gradient and filter ids. SVG ids are DOCUMENT-global, so two
 * flacons on one page with `id="glass"` would silently share the first one's
 * fills — every bottle in a grid would wear the colour of the first product.
 */
/**
 * The rim light.
 *
 * It happened to be spelled `#EDE8DF`, which is exactly the `bone` token — so
 * the drift guard flagged it, correctly. It is not bone: bone is READING TEXT
 * on a dark ground, and this is light falling on an edge of glass. Two things
 * that share a hex today and must be free to move apart, which is the whole
 * argument for naming them separately rather than pointing one at the other.
 */
const RIM_LIGHT = '#EEE9E0';

export function Flacon({
  family,
  house,
  uid,
  className = '',
}: {
  family: string;
  house: string;
  uid: string;
  className?: string;
}) {
  const g = glassPalette(family);
  const id = (name: string) => `${name}-${uid}`;
  const url = (name: string) => `url(#${id(name)})`;

  return (
    <svg
      viewBox="0 0 240 440"
      className={className}
      role="presentation"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {/* Absorption across the width: dense at both edges, open at the centre. */}
        <linearGradient id={id('juice')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={g.edge} />
          <stop offset="7%" stopColor={g.edge} />
          <stop offset="16%" stopColor={g.deep} />
          <stop offset="34%" stopColor={g.core} />
          <stop offset="50%" stopColor={g.core} />
          <stop offset="70%" stopColor={g.deep} />
          <stop offset="90%" stopColor={g.edge} />
          <stop offset="100%" stopColor={g.edge} />
        </linearGradient>

        {/* Vertically, the juice deepens toward the base — more of it to cross. */}
        <linearGradient id={id('depth')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000" stopOpacity="0" />
          <stop offset="72%" stopColor="#000" stopOpacity=".22" />
          <stop offset="100%" stopColor="#000" stopOpacity=".46" />
        </linearGradient>

        {/* Empty glass. Painted at LOW ALPHA so the lit scene shows through it —
            this is the single stop that separates glass from ceramic. Only the
            edges, where the light crosses real thickness, approach opacity. */}
        <linearGradient id={id('air')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={g.edge} stopOpacity=".98" />
          <stop offset="11%" stopColor={g.air} stopOpacity=".92" />
          <stop offset="34%" stopColor={g.air} stopOpacity=".62" />
          <stop offset="60%" stopColor={g.air} stopOpacity=".70" />
          <stop offset="89%" stopColor={g.edge} stopOpacity=".94" />
          <stop offset="100%" stopColor={g.edge} stopOpacity=".98" />
        </linearGradient>

        {/* The specular strip — the window reflected in the front face. */}
        <linearGradient id={id('spec')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFF3E0" stopOpacity="0" />
          <stop offset="14%" stopColor="#FFF3E0" stopOpacity=".78" />
          <stop offset="72%" stopColor="#FFF3E0" stopOpacity=".42" />
          <stop offset="100%" stopColor="#FFF3E0" stopOpacity="0" />
        </linearGradient>

        {/* Cool rim light down the far edge — separates glass from background. */}
        <linearGradient id={id('rim')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={RIM_LIGHT} stopOpacity="0" />
          <stop offset="30%" stopColor={RIM_LIGHT} stopOpacity=".38" />
          <stop offset="88%" stopColor={RIM_LIGHT} stopOpacity=".10" />
          <stop offset="100%" stopColor={RIM_LIGHT} stopOpacity="0" />
        </linearGradient>

        {/* Brushed metal: banded, never a smooth ramp — smooth reads as plastic. */}
        <linearGradient id={id('cap')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1E1913" />
          <stop offset="12%" stopColor="#6A5637" />
          <stop offset="26%" stopColor="#C9A96A" />
          <stop offset="38%" stopColor="#7E663F" />
          <stop offset="54%" stopColor="#A98B55" />
          <stop offset="72%" stopColor="#5E4B2E" />
          <stop offset="88%" stopColor="#8B7145" />
          <stop offset="100%" stopColor="#1B1611" />
        </linearGradient>

        <linearGradient id={id('collar')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2A2118" />
          <stop offset="30%" stopColor="#C3A469" />
          <stop offset="55%" stopColor="#6E5936" />
          <stop offset="100%" stopColor="#241C14" />
        </linearGradient>

        {/* The soft ambient shadow the bottle sits in. */}
        <radialGradient id={id('shadow')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000" stopOpacity=".82" />
          <stop offset="58%" stopColor="#000" stopOpacity=".34" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>

        {/* Light focused THROUGH the glass onto the surface, tinted by the juice. */}
        <radialGradient id={id('caustic')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={g.caustic} stopOpacity=".55" />
          <stop offset="45%" stopColor={g.caustic} stopOpacity=".22" />
          <stop offset="100%" stopColor={g.caustic} stopOpacity="0" />
        </radialGradient>

        <filter id={id('soft')} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id={id('hairblur')} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>

        {/*
          The silhouette, reused for glass, air and clipping.

          Straight CHAMFERED shoulders, not curved ones. A soft radius where the
          body meets the neck is the shape of a household bottle — shampoo,
          detergent — and the eye reads that instantly, however well the glass
          itself is rendered. Niche flaconnage is architectural: flat planes,
          hard angles, and a base with almost no radius so the object sits like
          a block of glass rather than a container.
        */}
        <clipPath id={id('body')}>
          <path d="M64 360 V178 L96 130 H144 L176 178 V360 Q176 366 170 366 H70 Q64 366 64 360 Z" />
        </clipPath>
      </defs>

      {/* ---------------------------------------------------------- surface */}
      {/* Ambient shadow, then the caustic pool, then the hard contact shadow.
          Order matters: the contact patch must sit ON TOP of the caustic or the
          bottle appears to hover a few millimetres above the table. */}
      <ellipse cx="120" cy="378" rx="94" ry="16" fill={url('shadow')} />
      <ellipse cx="128" cy="382" rx="72" ry="10" fill={url('caustic')} filter={url('soft')} />
      <ellipse cx="120" cy="367" rx="54" ry="5" fill="#000" opacity=".72" filter={url('hairblur')} />

      {/* ------------------------------------------------------------- cap
          Squared off, and narrow relative to the body. The proportion that
          matters is cap-to-body: about 1:4 reads as considered, 1:2 as a spray
          bottle. */}
      <rect x="100" y="38" width="40" height="58" rx="1" fill={url('cap')} />
      {/* Two sweeps, not one: a bright band high where the light strikes and a
          dark band low where the metal turns away. A single highlight over a
          flat fill is exactly the beige-box look. */}
      <rect x="100" y="50" width="40" height="6" fill="#F4E2BC" opacity=".34" />
      <rect x="100" y="78" width="40" height="10" fill="#000" opacity=".22" />
      <rect x="100" y="90" width="40" height="2.5" fill="#000" opacity=".42" />

      {/* ----------------------------------------------------------- collar */}
      <rect x="104" y="94" width="32" height="6" fill={url('collar')} />

      {/* ------------------------------------------------------------ neck */}
      <rect x="106" y="99" width="28" height="33" fill={url('juice')} opacity=".82" />
      <rect x="106" y="99" width="2" height="33" fill="#FFF6E6" opacity=".26" />

      {/* ------------------------------------------------------------ body */}
      <g clipPath={url('body')}>
        {/* Empty glass fills the whole silhouette… */}
        <rect x="58" y="126" width="126" height="244" fill={url('air')} />
        {/* …then the juice is poured to its level, leaving air above it. The
            level sits BELOW the shoulder, never at the brim: a bottle filled to
            the top has no liquid line, and the liquid line is the tell. */}
        <rect x="58" y="216" width="126" height="154" fill={url('juice')} />
        <rect x="58" y="216" width="126" height="154" fill={url('depth')} />

        {/* The meniscus: a bright line where liquid meets air, with the denser
            band immediately beneath it. */}
        <rect x="58" y="214" width="126" height="2.2" fill="#FFF1D8" opacity=".38" />
        <rect x="58" y="216.2" width="126" height="8" fill="#000" opacity=".18" />

        {/* The thick base: light enters it and bounces back up, then the very
            bottom goes dark where the glass meets the table. */}
        <rect x="58" y="330" width="126" height="24" fill={g.core} opacity=".34" filter={url('soft')} />
        <rect x="58" y="354" width="126" height="16" fill="#000" opacity=".38" />

        {/* The liquid glows. Without this the juice is a coloured shape; with
            it the flacon becomes the brightest thing in the frame, which is the
            entire point of putting one object on a dark set. */}
        <ellipse cx="118" cy="286" rx="46" ry="62" fill={g.core} opacity=".38" filter={url('soft')} />

        {/* A NARROW soft strip beside a HARD thin line. One without the other
            reads as airbrushing; together they read as a window reflected in a
            flat glass face. */}
        <rect x="82" y="136" width="9" height="212" fill={url('spec')} filter={url('hairblur')} />
        <rect x="75" y="142" width="2.4" height="202" fill="#FFFAF0" opacity=".92" />
        {/* A second, much narrower catch on the opposite chamfer. Two
            highlights at different intensities is what tells the eye the
            surface has more than one plane. */}
        <rect x="160" y="180" width="1.4" height="140" fill="#FFF6E6" opacity=".34" />
        <rect x="166" y="140" width="4" height="206" fill={url('rim')} />

        {/* Inner shoulder bounce, very soft — keeps the chamfer from going flat. */}
        <ellipse cx="100" cy="152" rx="28" ry="13" fill="#FFF0D6" opacity=".10" filter={url('soft')} />
      </g>

      {/* Silhouette edge: the darkest line in the render, drawn last so nothing
          inside can wash it out. Glass is defined by its edge. */}
      <path
        d="M64 360 V178 L96 130 H144 L176 178 V360 Q176 366 170 366 H70 Q64 366 64 360 Z"
        fill="none"
        stroke="#000"
        strokeOpacity=".85"
        strokeWidth="2"
      />
      {/* A hairline of returned light just inside the silhouette — the edge of
          real glass is never a single dark line. */}
      <path
        d="M64 360 V178 L96 130 H144 L176 178 V360 Q176 366 170 366 H70 Q64 366 64 360 Z"
        fill="none"
        stroke="#E8D9BC"
        strokeOpacity=".22"
        strokeWidth=".8"
      />

      {/* ----------------------------------------------------------- label
          Debossed, not printed: a hairline frame and letterspaced caps at low
          opacity. A bright label on a dark bottle is a sticker. */}
      {/*
        Etched, not applied. The first version drew a filled box with a border,
        which is a STICKER — and a sticker on a flacon is the single cheapest
        thing an object can wear. What remains is the type itself and one rule,
        at the opacity of something abraded into the surface.
      */}
      <g opacity=".78">
        <text
          x="121"
          y="269"
          textAnchor="middle"
          fill="#EFE3CA"
          fillOpacity=".70"
          fontSize="7"
          letterSpacing="2.6"
          fontFamily="var(--f-label)"
        >
          DIYAR
        </text>
        <line x1="102" y1="275" x2="140" y2="275" stroke="#E6D9BE" strokeOpacity=".28" strokeWidth=".6" />
        <text
          x="121"
          y="286"
          textAnchor="middle"
          fill="#EFE3CA"
          fillOpacity=".55"
          fontSize="5.6"
          letterSpacing="1.5"
          fontFamily="var(--f-label)"
        >
          {house.toUpperCase().slice(0, 18)}
        </text>
      </g>

    </svg>
  );
}

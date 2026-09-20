import Image from "next/image";

/**
 * The club's actual logo, in the two pieces the app draws it in.
 *
 * The source is one square lockup — monogram over wordmark — which is the
 * wrong shape for every slot in a 390px-wide app. `scripts/build_brand_assets.py`
 * cuts it in half and writes white-on-transparent PNGs at 2x, so a header bar
 * can set the two side by side and a footer can take the wordmark alone.
 *
 * Both are sized by height: the caller says how tall, the aspect ratio does the
 * rest. Getting that ratio wrong is how a logo ends up subtly stretched, so the
 * numbers live here once and are measured from the files.
 */

/** Intrinsic size of public/brand/mark.png, before the 2x export. */
const MARK_RATIO = 343 / 588;
/** Intrinsic size of public/brand/wordmark.png, before the 2x export. */
const WORDMARK_RATIO = 831 / 113;

/**
 * The FR monogram. Decorative everywhere it appears — the thing it names is
 * always already labelled, so it stays out of the accessibility tree.
 */
export function Mark({
  height,
  className,
  priority = false,
}: {
  height: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/mark.png"
      alt=""
      aria-hidden
      width={Math.round(height * MARK_RATIO)}
      height={height}
      priority={priority}
      // Tailwind's preflight sets `height: auto` on every img, which overrides
      // the height attribute and leaves next/image warning that only one of the
      // two dimensions is under CSS control. Stating the height in CSS and
      // letting the width follow settles it without unpicking preflight.
      style={{ height: `${height}px`, width: "auto" }}
      // Already exported at 2x at exactly the sizes it is drawn at. There is
      // nothing for the optimizer to do but cost a transformation.
      unoptimized
      className={className}
    />
  );
}

/** "FC RAMMESLAG", set in the logo's own type rather than the UI font. */
export function Wordmark({
  height,
  className,
  priority = false,
}: {
  height: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/wordmark.png"
      alt=""
      aria-hidden
      width={Math.round(height * WORDMARK_RATIO)}
      height={height}
      priority={priority}
      style={{ height: `${height}px`, width: "auto" }}
      unoptimized
      className={className}
    />
  );
}

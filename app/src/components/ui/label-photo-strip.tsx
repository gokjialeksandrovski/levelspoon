"use client";

import Image from "next/image";
import { useState } from "react";

import { FOCUS_RING } from "./tap-target";

// Same treatment PhotoPreview uses for an object URL: intrinsic size is
// unknowable here, and the bytes are already local so there is nothing to
// optimise.
const LABEL_PHOTO_SIZE_PX = 300;
const LABEL_PHOTO_EXPANDED_HEIGHT = "max-h-72";

// Collapsed, this is a thumbnail and a label, not a squashed photo: a
// nutrition label is portrait, so any strip-height rendering of it is either
// a crop that misses the table or a postage stamp in an empty bar. The
// thumbnail says which photo, the text says what tapping does.
const CollapsedLabelPhoto = ({ url }: { url: string }) => (
  <span className="flex items-center gap-3">
    <Image
      src={url}
      alt=""
      width={LABEL_PHOTO_SIZE_PX}
      height={LABEL_PHOTO_SIZE_PX}
      unoptimized
      className="size-10 shrink-0 rounded-control object-cover"
    />
    <span className="text-sm text-text-muted">Label photo: tap to check against it</span>
  </span>
);

const ExpandedLabelPhoto = ({ url }: { url: string }) => (
  <Image
    src={url}
    alt="The nutrition label these values were read from"
    width={LABEL_PHOTO_SIZE_PX}
    height={LABEL_PHOTO_SIZE_PX}
    unoptimized
    className={`w-full rounded-control object-contain ${LABEL_PHOTO_EXPANDED_HEIGHT}`}
  />
);

// The screens that show this ask the user to check seven numbers against the
// label, so the label stays reachable while they scroll the fields.
//
// Sticky only while collapsed - pinning the expanded photo would hold ~40% of
// a phone screen for the whole scroll.
//
// No size transition: the only honest way to animate this is a height change,
// which the project's motion rules rule out.
//
// A full-bleed expand/collapse row, not a Button: it spans the page gutters
// and its content is a photo, neither of which the Button contract covers.
export const LabelPhotoStrip = ({ url }: { url: string }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setExpanded((open) => !open)}
      aria-expanded={expanded}
      aria-label={expanded ? "Collapse label photo" : "Expand label photo"}
      className={`z-10 -mx-4 block w-[calc(100%+2rem)] border-b border-border bg-surface-raised px-4 py-2 text-left ${expanded ? "" : "sticky top-0"} ${FOCUS_RING}`}
    >
      {expanded ? <ExpandedLabelPhoto url={url} /> : <CollapsedLabelPhoto url={url} />}
    </button>
  );
};

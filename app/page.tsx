"use client";

import { Fragment, useMemo, useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { RowSkeletons } from "@/components/ui/skeleton";
import { LadderRow } from "@/components/ladder/ladder-row";
import { BundpropRow } from "@/components/ladder/bundprop-row";
import { GuestToggle } from "@/components/ladder/guest-toggle";
import { useFlip } from "@/components/ladder/use-flip";
import { useLadder, useSeasons } from "@/lib/queries";
import { ladderZones } from "@/lib/zones";
import { PROVISIONAL_MATCHES, type LadderScope } from "@/lib/types";

export default function LadderPage() {
  const seasons = useSeasons();
  const current = seasons.data?.find((season) => season.is_current) ?? seasons.data?.[0] ?? null;
  const [scope, setScope] = useState<LadderScope>("all");
  const [showGuests, setShowGuests] = useState(false);
  const ladder = useLadder(scope, showGuests);
  const register = useFlip();

  const options = useMemo(
    () => [
      { value: "all" as LadderScope, label: "All-time" },
      ...(current ? [{ value: current.id as LadderScope, label: current.name }] : []),
    ],
    [current],
  );

  const seasonMode = scope !== "all";
  const entries = ladder.data?.entries ?? [];
  const threshold = ladder.data?.threshold ?? PROVISIONAL_MATCHES;
  const members = entries.filter((entry) => !entry.is_guest);

  // The bundprop is the last MEMBER, whether or not guests are on screen.
  const bundpropId = members.length > 1 ? members[members.length - 1].player_id : null;
  const above = members.length > 1 ? members[members.length - 2] : null;

  // Both ends of the table are tinted; the middle is left alone. Guests are
  // never zoned — they are being measured, not ranked against the team.
  const zones = useMemo(() => ladderZones(members), [members]);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h1 className="text-hero font-black tracking-[-0.045em]">STIGEN</h1>
        <span className="num shrink-0 text-[10px] tracking-[0.14em] text-dim">
          {entries.length > 0 ? `${entries.length} RANGERET` : ""}
        </span>
      </div>

      <p className="mt-1 px-1 text-mini text-mute">
        {seasonMode
          ? "Rating vundet i sæsonen. All-time nulstilles aldrig."
          : "Hele holdet, rangeret. Ingen sidder over."}
      </p>

      <div className="mt-4">
        <Segmented options={options} value={scope} onChange={setScope} />
      </div>

      <div className="mt-3">
        <GuestToggle
          on={showGuests}
          onChange={setShowGuests}
          guestCount={ladder.data?.guest_count ?? 0}
        />
      </div>

      <div className="mt-4 flex items-center gap-2.5 px-3 pb-1.5">
        <span className="eyebrow w-5 text-right">#</span>
        <span className="w-4" />
        <span className="eyebrow flex-1">Spiller</span>
        <span className="eyebrow w-[72px] text-center">Form</span>
        <span className="eyebrow w-[60px] text-right">{seasonMode ? "Gevinst" : "Rating"}</span>
      </div>

      {ladder.isPending ? (
        <RowSkeletons count={10} />
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry, index) =>
            entry.player_id === bundpropId ? (
              <BundpropRow
                key={entry.player_id}
                entry={entry}
                seasonMode={seasonMode}
                threshold={threshold}
                above={above}
                innerRef={register(entry.player_id)}
              />
            ) : (
              <Fragment key={entry.player_id}>
                <LadderRow
                  entry={entry}
                  index={index}
                  seasonMode={seasonMode}
                  threshold={threshold}
                  zone={zones.get(entry.player_id)?.zone ?? null}
                  zoneDepth={zones.get(entry.player_id)?.depth ?? 0}
                  innerRef={register(entry.player_id)}
                />
              </Fragment>
            ),
          )}
        </div>
      )}

      {ladder.isError ? (
        <p className="py-10 text-center text-mini text-loss">Kunne ikke hente stigen.</p>
      ) : null}

      <p className="mt-7 px-1 text-center text-[10px] leading-relaxed text-dim">
        Bevægelse måles mod stigen før seneste session.
        <br />
        Toppen og bunden er tonet. Bunden er ikke en straf — den er et udgangspunkt.
        <br />
        Gæsternes kampe tæller altid med i ratingen — de står bare ikke på listen.
      </p>
    </div>
  );
}

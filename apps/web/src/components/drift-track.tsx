import {
  trackCaption,
  trackDescription,
  trackShares,
  type TrackReading,
} from '../lib/view.ts';

const percent = (share: number): string => `${(share * 100).toFixed(1)}%`;

/**
 * One measured value against the engine's threshold. The bar fills up to the observed
 * value and a tall tick marks the threshold, with the rule in words beneath. The
 * caption says which side of the tick is expected, so the shape never has to be read
 * by colour.
 */
export function DriftTrack({ reading }: { readonly reading: TrackReading }) {
  const { fill, tick } = trackShares(reading);

  return (
    <div className="track" data-limit={reading.limit}>
      <div className="track__rail" role="img" aria-label={trackDescription(reading)}>
        <span className="track__fill" style={{ width: percent(fill) }} />
        <span className="track__tick" style={{ left: percent(tick) }} />
      </div>
      <p className="track__caption" aria-hidden="true">
        {trackCaption(reading)}
      </p>
    </div>
  );
}

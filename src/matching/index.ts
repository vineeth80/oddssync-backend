/**
 * Entity Resolution Matching Engine
 *
 * Deterministic matching system that replaces fuzzy string matching
 * with a strict waterfall pipeline.
 *
 * @example
 * ```typescript
 * import { MarketNormalizer, WaterfallFilter } from './matching';
 *
 * const normalizer = new MarketNormalizer({
 *   "Longhorns": "Texas",
 *   "Sooners": "Oklahoma"
 * });
 *
 * const filter = new WaterfallFilter({
 *   temporalThresholdSeconds: 3600,
 *   lineTolerance: 0.5
 * });
 *
 * // Normalize markets
 * const pmMarket = normalizer.normalizePolymarket(rawPolymarketData);
 * const kalMarket = normalizer.normalizeKalshi(rawKalshiData);
 *
 * // Match
 * if (pmMarket && kalMarket) {
 *   const result = filter.match(pmMarket, kalMarket);
 *   if (result.isMatch) {
 *     console.log('Valid arbitrage opportunity!');
 *   } else {
 *     console.log(`Rejected: ${result.rejectionReason}`);
 *   }
 * }
 * ```
 */

export { MarketCategory, NormalizedMarket } from "./models";
export {
  MarketNormalizer,
  EntityAliasMap,
  PolymarketRawMarket,
  KalshiRawMarket,
} from "./normalizer";
export {
  WaterfallFilter,
  MatchResult,
  WaterfallFilterConfig,
} from "./filter";

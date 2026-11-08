/** Viewport placement result written imperatively onto the portaled menu. */
/**
 * Viewport-edge clamps are emitted as CSS custom properties; the stylesheet
 * composes them with the env(safe-area-inset-*) floors (see `.menu` in
 * ComposerPicker.module.css):
 *
 *   top:        max(var(--dsh-menu-top), calc(env(safe-area-inset-top) + gutter));
 *   right:      max(var(--dsh-menu-right), calc(env(safe-area-inset-right) + gutter));
 *   max-height: min(var(--dsh-menu-max-height), calc(100dvh - env(safe-area-inset-bottom) - env(safe-area-inset-top)));
 *
 * Numbers come from innerWidth/innerHeight, which exclude browser chrome but
 * not display cutouts, so the stylesheet side of the max()/min() keeps the
 * popup inside the safe area on notched phones.
 */
export interface PopupPlacementStyle {
    readonly '--dsh-menu-top': string;
    readonly '--dsh-menu-right': string;
    readonly '--dsh-menu-max-height': string;
    readonly visibility: 'visible';
}
export declare function samePlacement(left: PopupPlacementStyle | undefined, right: PopupPlacementStyle): boolean;
export interface PopupPlacementInput {
    readonly trigger: {
        readonly left: number;
        readonly right: number;
        readonly top: number;
        readonly bottom: number;
    };
    readonly menu: {
        readonly width: number;
        readonly height: number;
    };
    readonly viewport: {
        readonly width: number;
        readonly height: number;
    };
    readonly gutter?: number;
}
/**
 * Position the portaled picker menu in viewport coordinates, right-aligned to
 * its trigger and preferring the space above it, clamped to the viewport.
 */
/**
 * Position the portaled picker menu in viewport coordinates, right-aligned to
 * its trigger and preferring the space above it, clamped to the viewport.
 *
 * The height clamp is the viewport budget only (never a content measurement):
 * the stylesheet caps the box at that budget, so taller menu panes grow into
 * it naturally and a later ResizeObserver pass only re-reads the rendered box
 * to re-anchor the trigger edge. Capping from the measured box would instead
 * lock the menu at whatever height it first rendered with.
 */
export declare function placeComposerPopup({ trigger, menu, viewport, gutter }: PopupPlacementInput): PopupPlacementStyle;

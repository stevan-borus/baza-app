/**
 * Bottom offset for `KeyboardAwareScrollView`.
 *
 * The global `<KeyboardToolbar/>` (mounted in app/_layout) sits above the
 * keyboard and is NOT part of the keyboard height the scroll view measures,
 * so its height has to be added by hand — otherwise the focused field lands
 * *behind* the toolbar. Mirrors the library's own KEYBOARD_TOOLBAR_HEIGHT
 * (react-native-keyboard-controller, not publicly exported).
 */
const KEYBOARD_TOOLBAR_HEIGHT = 42;

/** Breathing room between the focused field and the toolbar. */
const DESIRED_GAP = 24;

export const KEYBOARD_BOTTOM_OFFSET = DESIRED_GAP + KEYBOARD_TOOLBAR_HEIGHT;

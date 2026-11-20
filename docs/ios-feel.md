# Making Vocla feel at home on iOS

Each rule below comes from Apple's Human Interface Guidelines (HIG) or from known iOS Safari behaviour, and is followed by how Vocla handles it.

| Rule | What Vocla does |
|---|---|
| A tab bar for 3–5 top-level sections, translucent, with the selected tab tinted (HIG, Tab bars) | Below 760px the left rail becomes a bottom tab bar: blurred, translucent, 49pt tall plus the home-indicator inset. The selected tab is tinted amber. Desktop shows the same five sections in the same order. |
| Tap targets at least 44×44pt (HIG) | On touch screens every button is at least 44px, and icon buttons are 44×44. |
| Large titles | Page titles are 30px bold on phones. |
| Sheets slide up from the bottom | Dialogs on phones are bottom sheets with a grabber, and they slide up. |
| Motion should be brief, interruptible, avoided on very frequent actions, and turned off by Reduce Motion (HIG, Motion) | Presses scale down slightly (60–160ms), cards fade and rise in (220ms), and sheets and menus pop in. Nothing blocks input. Everything is turned off when Reduce Motion is on. |
| Gestures | In review: tap the card to show the answer, swipe right for **Good** and left for **Again**. The card follows your finger and shows a label. Buttons still work. |
| Haptics | iOS Safari has no Vibration API. Since iOS 18, toggling a native `<input type=checkbox switch>` plays the system haptic, so Vocla clicks a hidden one on reveal, answer, and lesson right/wrong. Android uses `navigator.vibrate`. You can turn it off in Preferences. Because this relies on a side effect, Apple could change it. |
| Full screen from the Home Screen | `apple-mobile-web-app-capable`, a `black-translucent` status bar, `viewport-fit=cover`, a web manifest (`display: standalone`) and app icons. Content respects the safe-area insets. |
| No zoom on input focus | Inputs are 16px on touch devices. Below 16px, iOS Safari zooms the page when you tap into a field. |
| No grey tap flash or double-tap delay | `-webkit-tap-highlight-color: transparent` and `touch-action: manipulation`. UI chrome isn't text-selectable. |
| No "stuck" hover after a tap | All hover styles are inside `@media (hover: hover)`, so they only apply to mouse and trackpad. |
| Dynamic viewport | `100dvh` for full-height layouts, so Safari's collapsing toolbar doesn't cut off the answer buttons. |

To install on iPhone: open the app in Safari, tap **Share → Add to Home Screen**.

## Sources

- HIG Tab bars: https://developer.apple.com/design/human-interface-guidelines/tab-bars
- HIG Motion: https://developer.apple.com/design/human-interface-guidelines/motion
- 44pt touch targets: https://developer.apple.com/design/tips
- iOS status bar styles: https://medium.com/appscope/changing-the-ios-status-bar-of-your-progressive-web-app-9fc8fbe8e6ab
- Switch haptics in Safari 18: https://developer.apple.com/documentation/safari-release-notes/safari-18-release-notes · https://unpkg.com/ios-haptics@3.1.1/README.md

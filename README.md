# Spire - Refresh and Fallout Override
For use with Spire: The City Must Fall within Foundry VTT. The default behavior of the system is to only allow stress cleared via a refresh or by suffering fallout to apply to a single resistance track. However, the rules of the game indicate that the player can allocate the cleared stress however they want. This module overrides the default behavior of the system in Foundry to provide players with the ability to manage this through a pop-up UI.

In the settings page, you can find the option for "Heart-Style Fallout Checks". This is off by default, but when turned on it makes two changes:
- Level of fallout suffered is based on the result of the d10 roll to check for fallout, rather than on the character's total stress. This means characters with high stress still have a chance to incur minor fallout.
- Fallout occurs when the d10 roll is less than *or equal to* the character's total stress. In the default behavior, it only occurs when the d10 is less than total stress.

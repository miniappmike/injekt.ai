# Reference: existing Influencer Injector prototype UI (text notes only, screenshots not committed)

# Influencer Injector (claude.ai artifact 8vd7aHRyGJCh4LV8WDy6c7) - UI context
Screenshots 1-5 in this folder.
Top nav: Inject | Variants | Likeness | Reference Sheet | Characters; WaveSpeed credits ($0.526), Top up, history, theme toggle.
Characters sidebar: Audra, Juno, Lula.
1. Inject > Write prompts: 01 Target images (upload/batch up to 10, Ctrl+V paste), Clean up overlays toggle, 02 Outfit (optional), 03 Prompt setup (Sectioned, Match the target; "Write replacement prompt"). Right: Replacement prompts, model tabs SD 5 Pro $0.041 / GPT 2.5 $0.039 / Nano Banana 2.1 $0.038 / SD 4.5 $0.040; aspect 2:3, 1k, PNG, "Preview here"; "Edit the target photo" toggle.
2. Inject > Direct swap: sends target + character reference sheet straight to WaveSpeed (no prompt step); button "Direct swap".
3. Inject > Edit: user-written prompt sent as-is with target + chosen references; "Generate 1 image $0.043".
4. Variants > Edits: upload generated image, optional character, toggles (pose, camera angle, hairstyle...), "Write variant edits"; Copy all.
5. Variants > Carousel: cover + planned slides (Pose & angle, Her new spot, Outfit detail, Flat lay...), "Plan carousel".
Footer: "77 calls today" counter.

## Screenshots 6-10
6. Reference Sheet tab: Step 1 Face sheet (optional; one face photo -> 3x3 face sheet, est. $0.084/sheet); Step 2 Face + body sheet (face sheet + 1-2 body photos: front/back/side; 0 of 3). Buttons "1 · Face sheet $0.084" and "2 · Face + body sheet $0.084". Result usable as @image1 on a character.
7. Characters tab: card grid (Audra, Juno, Lula), each with 3 reference thumbnails, identity-line blurb, Use/Edit buttons; "New character" button. Note: characters/history/settings sync to the Claude account; use only photos you own/licensed or of invented characters. The saved profile is the sole source of the character description.
8. Edit character (Juno): Name, Always keep (e.g. gold chain), Height, Weight (optional), Profile photo (icon only, never sent to Claude), Face sheet upload/remove ("Profile ready" badge).
9. Edit character, cont.: Body sheet (or combined face+body) via pasted WaveSpeed link or upload; "Make reference sheets from photos" button; uploaded sheets are split once into face/body refs for every model; pasted link is sent whole; no sheet -> reference photos sent.
10. Edit character, cont.: Reference images (up to 3), "Build profile from sheets and references" button, then Identity line text field.

## Screenshot 11
11. Edit character, bottom: generated profile fields (Identity line, Face, Hair, Skin/freckles/marks, Body and build, Distinctive traits, Signature accessories), all editable textareas. Buttons: Save character, Back, Delete.

## Screenshot 12
12. Prompt history side panel (100 saved): search box, "All characters" filter, entries per character with timestamp, label (e.g. "Variant · Parking lot jump", "Colours: navy and cherry red"), prompt preview ("Use @image1 as the strict identity reference...", "Edit @image2. Keep the person exactly..."), thumbnail, copy button, expand chevron; header buttons: export, delete all, close.

## Screenshots 13-16 (Likeness tab)
Likeness = QA loop for a generated image vs. the character's reference sheet.
13. Likeness: pick a character, "Checking" thumbnail, 04 Face fix (model SD 5 Pro/GPT 2.5/Nano Banana 2.1; toggle "Also match hair colour and hairline"; optional note; sends the character's face close-up + angles from her face sheet; keeps everything else and plants only her face). Buttons: Check likeness, Face fix $0.041, Stop. Report pane shows "Comparing the faces trait by trait...".
14. Likeness, top: 01 Reference sheet (optional, uses saved sheet, click/drop/paste to replace), 02 Generated image (drop next attempt), 03 Prompt you used (optional). Help text: each check scores face trait by trait against references and writes fixes; regenerate, drop new image, watch the score climb; Face fix swaps in only her face.
15. Likeness report detail: Build and Body proportions 9/10, "Fix phrases" (copyable text to add to prompts), "Edit prompt for the generated image" (copyable). Hint: use the fixes, generate again, drop new image, check again.
16. Likeness report top: overall score 80/100 (round badge R1 · 80), summary text, per-trait scores out of 10 with Reference vs Generated notes and Fix phrase: Face shape, Eyes, Brows, Nose, Lips, Jaw and cheekbones, etc.

# Hanzi 1000 — learn to read and say Chinese characters

A web app for learning the **1,000 most common Chinese characters** in a **15-minute daily lesson**, with a **microphone pronunciation coach** that scores how well you say each character.

## What a daily lesson looks like

Each lesson runs on a 15-minute timer (you can change the length in Settings):

1. **Review.** Characters you've learned come back on a spaced-repetition schedule, timed for just before you'd forget them. Each review is one drill: meaning, pinyin, listening, or speaking.
2. **Learn new characters.** By default you get 10 a day, in frequency order (的, 一, 是, 不, 了 …). For each one you see the character, its pinyin and tone, its meaning, an animated stroke order and 2–3 common example words. You can hear it at normal or slow speed and try saying it.
3. **Practice.** The new characters are drilled in batches of 5:
   - *What does it mean?* (multiple choice)
   - *How is it pronounced?* (pick the right pinyin; the wrong answers include the same syllable with other tones)
   - *Which character did you hear?*
   - *Read it aloud.* Tap 🎤 and say the character.
4. **Bonus practice.** If you finish early, it drills your weakest characters until the time is up.

At 10 new characters a day you finish all 1,000 in about 100 days. Missed items come back later in the same lesson. Your streak, progress ring and weekly chart are on the home screen.

## 🐼 Your panda

The home screen and the end-of-lesson summary show a panda that grows with every character you **master**. A character counts as mastered once your reviews have pushed its next review a week or more away. The panda starts as a tiny newborn cub and grows through Cub (50), Young (150), Teen (300), Grown (500) and Big (750) until it's a full-size **Giant panda with a crown at 1,000**. When you've mastered new characters since you last looked, it animates up to its new size.

## How the pronunciation scoring works

When you tap 🎤, the app does two things at once:

- **Speech recognition** (Mandarin, `zh-CN`) works out which character you said. Saying the exact character scores highest. A homophone with the same sound and tone (for example 事 for 是) also counts. If you get the right syllable but the wrong tone (十 *shí* instead of 是 *shì*), you're told which tone it sounded like.
- **Pitch tracking** follows your voice's pitch through the syllable and works out which of the four tones you produced. The app learns your natural pitch range as you use it. Your pitch curve is drawn over the target tone's shape, so you can see what went wrong, for example a 4th tone that doesn't fall far enough.

These combine into a 0–100 score. You can play back your own recording and compare it with the model voice. Only your first try counts toward scheduling, and you can retry as often as you like. If the recognizer gets it wrong, tap **"I said it right — count it"**.

## Running it

It's a static site with no build step and no dependencies to install. **The microphone only works over `https://` or on `localhost`**, so don't open `index.html` directly as a file.

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

To use it on your phone, publish the repo with **GitHub Pages** (Settings → Pages → deploy from branch). That gives you an https URL; open it on your phone and use "Add to Home Screen" to get an app icon.

**Browser support:** Chrome, Edge and Safari (desktop, Android and iOS) give full feedback. Firefox has no speech recognition, so there it scores tone only. The rest of the app works everywhere. Progress is saved in your browser, and you can export or import it from Settings.

## Project layout

```
index.html          app shell
css/style.css       styles (light & dark mode)
js/store.js         progress storage + spaced-repetition scheduler
js/speech.js        text-to-speech, mic capture, pitch tracking, tone classifier, scoring
js/panda.js         panda progress tracker
js/app.js           home screen, lesson engine, character browser, settings
data/hanzi.js       generated: 1,000 characters (+ pinyin readings for scoring)
tools/build_data.py regenerates data/hanzi.js from the sources below
```

## Data sources

- Character frequency: Jun Da, *Modern Chinese Character Frequency List*
- Pinyin, definitions and example words: [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cedict) (CC BY-SA 4.0)
- Example word ranking: [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (OpenSubtitles)
- Stroke-order animation: [Hanzi Writer](https://hanziwriter.org) (loaded from a CDN, so it needs a connection)

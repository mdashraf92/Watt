# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

This project is on **SDK 57** (React Native 0.86, React 19.2). It was upgraded from
SDK 56 because the current Expo Go release targets 57 and would not open the project.

Keep this link pinned to the SDK in `package.json`. An answer from the wrong version's
docs is worse than no answer, because it looks right.

# The brand name is never translated

**Go Watt** is written in Latin script in every language, including inline inside Arabic
sentences. Never `جو واط`, and never any other transliteration.

It reads correctly inside RTL copy on its own: in an Arabic paragraph the Latin run is
placed by the Unicode bidirectional algorithm, and trailing punctuation takes the
paragraph direction. Do not "fix" it with wrapper characters unless a real rendering
bug is observed on a device.

To check before committing Arabic copy:

```bash
grep -rn "جو واط\|قو وات" src/
```

The marketing site enforces the same rule in code, via its `BrandName`/`CopyText`
components and `scripts/check-content.mjs`.

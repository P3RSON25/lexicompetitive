# Dictionary Data

The server prefers
`C:\Users\wenyu\Downloads\word dictionary final.json` and falls back to the
bundled `word dictionary final.json` in this directory when the Windows path is
not available. Override that path with the `WORDS_FILE` environment variable if
needed. The loader accepts either:

- An object whose keys are words and whose values are ignored.
- An array of word strings.

Words are normalized to lowercase and must contain only ASCII letters. There is
no maximum word length in the loader. Words outside the loaded file are
rejected; the game does not query a second dictionary.

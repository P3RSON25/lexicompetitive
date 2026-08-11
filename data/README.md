# Dictionary Data

The server defaults to
`C:\Users\wenyu\Downloads\word dictionary final.json`. Override that path with
the `WORDS_FILE` environment variable if needed. The loader accepts either:

- An object whose keys are words and whose values are ignored.
- An array of word strings.

Words are normalized to lowercase and must contain only ASCII letters. There is
no maximum word length in the loader.

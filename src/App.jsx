import { useState, useCallback, useEffect, useRef } from 'react'
import './App.css'

const HF_MODEL = 'stabilityai/stable-diffusion-xl-base-1.0'

function getInferenceUrl() {
  const path = `/hf-inference/models/${HF_MODEL}`
  if (import.meta.env.DEV) {
    return `/huggingface-inference${path}`
  }
  return `https://router.huggingface.co${path}`
}

function parseErrorMessage(status, bodyText, json) {
  if (json && typeof json.error === 'string') return json.error
  if (json && Array.isArray(json.error)) return json.error.join(', ')
  if (json && json.error && typeof json.error === 'object') {
    try {
      return JSON.stringify(json.error)
    } catch {
      /* ignore */
    }
  }
  if (bodyText && bodyText.length > 0) {
    return bodyText.length > 280 ? `${bodyText.slice(0, 280)}…` : bodyText
  }
  return `Request failed (${status})`
}

async function readResponseError(res) {
  const text = await res.text()
  try {
    const json = JSON.parse(text)
    return parseErrorMessage(res.status, text, json)
  } catch {
    return parseErrorMessage(res.status, text, null)
  }
}

async function requestImage(prompt, token) {
  const url = getInferenceUrl()
  const maxAttempts = 6

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: prompt }),
    })

    if (res.status === 503) {
      let waitSec = 12
      try {
        const j = await res.json()
        if (typeof j.estimated_time === 'number') {
          waitSec = Math.min(Math.max(j.estimated_time, 1), 120)
        }
      } catch {
        /* use default */
      }
      await new Promise((r) => setTimeout(r, waitSec * 1000))
      continue
    }

    if (!res.ok) {
      throw new Error(await readResponseError(res))
    }

    const contentType = res.headers.get('content-type') || ''
    const blob = await res.blob()

    if (
      contentType.includes('application/json') ||
      blob.type.includes('json')
    ) {
      const text = await blob.text()
      let json
      try {
        json = JSON.parse(text)
      } catch {
        throw new Error(text || 'Unexpected response from Hugging Face.')
      }
      throw new Error(parseErrorMessage(res.status, text, json))
    }

    return blob
  }

  throw new Error(
    'The model is still loading. Wait a minute, then try again.',
  )
}

function App() {
  const token = import.meta.env.VITE_HF_TOKEN
  const [prompt, setPrompt] = useState('')
  const [imageUrl, setImageUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const imageUrlRef = useRef(null)

  const setPreviewBlob = useCallback((blob) => {
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current)
      imageUrlRef.current = null
    }
    const next = URL.createObjectURL(blob)
    imageUrlRef.current = next
    setImageUrl(next)
  }, [])

  useEffect(() => {
    return () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current)
        imageUrlRef.current = null
      }
    }
  }, [])

  const handleGenerate = useCallback(async () => {
    const trimmed = prompt.trim()
    if (!trimmed) return

    if (!token?.trim()) {
      setError('Image generation is not configured. Please try again later.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const blob = await requestImage(trimmed, token.trim())
      setPreviewBlob(blob)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Something went wrong. Try again.',
      )
    } finally {
      setLoading(false)
    }
  }, [prompt, token, setPreviewBlob])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (!loading && prompt.trim()) handleGenerate()
    }
  }

  const downloadName = `generated-${Date.now()}.png`

  return (
    <main className="app">
      <div className="app__shell">
        <header className="app__header">
          <div className="app__header-row">
            <span className="app__badge" aria-hidden>
              <svg
                className="app__badge-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m12 3 1.7 5.2h5.5l-4.4 3.2 1.7 5.2-4.5-3.3-4.5 3.3 1.7-5.2L5 8.2h5.5z" />
              </svg>
              SDXL
            </span>
          </div>
          <h1 className="app__title">Text to image</h1>
          <p className="app__subtitle">
            Powered by{' '}
            <a
              href="https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0"
              target="_blank"
              rel="noreferrer"
              className="app__link"
            >
              SDXL Base 1.0
            </a>{' '}
            on Hugging Face. Accept the model terms if requests fail.{' '}
            <span className="app__shortcut">
              <kbd className="app__kbd">⌘</kbd> or{' '}
              <kbd className="app__kbd">Ctrl</kbd>
              <span className="app__kbd-plus">+</span>
              <kbd className="app__kbd">Enter</kbd> to generate.
            </span>
          </p>
        </header>

        <div className="app__grid">
          <section className="app__panel" aria-label="Generation controls">
            <label className="app__label" htmlFor="prompt-input">
              Prompt
            </label>
            <textarea
              id="prompt-input"
              className="app__textarea"
              rows={5}
              placeholder="Describe your scene — e.g. watercolor fox in a misty forest at dawn, soft light, 35mm"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              aria-busy={loading ? 'true' : 'false'}
            />
            <div className="app__actions">
              <button
                type="button"
                className="app__generate"
                onClick={handleGenerate}
                disabled={loading || !prompt.trim()}
              >
                {loading ? (
                  <>
                    <span className="app__btn-spinner" aria-hidden />
                    <span>Generating…</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="app__btn-icon"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M12 3v3M12 18v3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M3 12h3M18 12h3M4.9 19.1l2.2-2.2M16.9 7.1l2.2-2.2" />
                      <circle cx="12" cy="12" r="4" />
                    </svg>
                    <span>Generate image</span>
                  </>
                )}
              </button>
            </div>
          </section>

          <section className="app__panel app__panel--preview" aria-label="Preview">
            {loading && (
              <div
                className="app__loading app__loading--overlay"
                role="status"
                aria-live="polite"
              >
                <span className="app__spinner" aria-hidden />
                <span className="app__loading-text">
                  Calling Hugging Face…
                </span>
              </div>
            )}

            {error && (
              <p className="app__error" role="alert">
                {error}
              </p>
            )}

            <div className="app__preview-inner">
              {imageUrl ? (
                <figure
                  className={`app__figure${loading ? ' app__figure--pending' : ''}`}
                >
                  <div className="app__frame">
                    <img
                      src={imageUrl}
                      alt={prompt.trim() || 'Generated result'}
                      className="app__image"
                      width={768}
                      height={768}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <figcaption className="app__caption-wrap">
                    <p className="app__caption" title={prompt.trim()}>
                      {prompt.trim()}
                    </p>
                    {!loading && (
                      <a
                        className="app__download"
                        href={imageUrl}
                        download={downloadName}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden
                        >
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                        Download PNG
                      </a>
                    )}
                  </figcaption>
                </figure>
              ) : (
                !loading && (
                  <div className="app__placeholder">
                    <div className="app__placeholder-icon" aria-hidden>
                      <svg
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    </div>
                    <p className="app__placeholder-title">Preview</p>
                    <p className="app__placeholder-hint">
                      Generated artwork shows here with a download option.
                    </p>
                  </div>
                )
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

export default App

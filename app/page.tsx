export default function Home() {
  return (
    <main className="grid-overlay flex h-screen items-center justify-center">
      <div className="text-center">
        <p className="eyebrow mb-3">Lab-Native Annotation</p>
        <h1
          className="text-6xl"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
        >
          <span className="gradient-text">Rookery</span>
        </h1>
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          Scaffold online.
        </p>
      </div>
    </main>
  )
}

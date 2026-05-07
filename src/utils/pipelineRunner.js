let _running = false
let _paused = false
let _aborted = false
let _jobId = null
const _listeners = new Set()

function _notify() {
  const s = getRunnerState()
  _listeners.forEach(fn => fn(s))
}

export function getRunnerState() {
  return { running: _running, paused: _paused, jobId: _jobId }
}

export function subscribeRunner(fn) {
  _listeners.add(fn)
  fn(getRunnerState())
  return () => _listeners.delete(fn)
}

export function runnerStart(jobId) {
  _running = true; _paused = false; _aborted = false; _jobId = jobId
  _notify()
}

export function runnerComplete() {
  _running = false; _paused = false; _aborted = false; _jobId = null
  _notify()
}

export function runnerPause() {
  if (_running && !_paused) { _paused = true; _notify() }
}

export function runnerResume() {
  if (_running && _paused) { _paused = false; _notify() }
}

export function runnerStop() {
  _aborted = true; _running = false; _paused = false; _jobId = null
  _notify()
}

// Resolves to true if the run was aborted, false if resumed normally
export async function awaitResume() {
  while (_paused && !_aborted) {
    await new Promise(r => setTimeout(r, 250))
  }
  return _aborted
}

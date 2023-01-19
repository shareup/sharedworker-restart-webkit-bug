let sharedWorker
let count = 0
const title = document.getElementById('title')
const form = document.getElementById('start-form')
const pre = document.getElementById('logs')
const url = new URL(window.location.href)
const messageLogger = e => { log(`    Received message from worker: '${e.data}'`) }

// MAIN
if (url.searchParams.get('w') === 'two') {
  title.innerText = 'Page 2'
  form.style.display = 'none'

  beginTestForPage2()
} else {
  title.innerText = 'Page 1'

  form.onsubmit = e => {
    e.preventDefault()
    form.style.display = 'none'
    beginTestForPage1()
  }
}

// TESTS
async function beginTestForPage1() {
  if (!await initSharedWorker()) { return }

  // Prepare for when Page 2 will shutdown the SharedWorker
  const shutdownListener = e => {
    if (e.data === 'shutdown') {
      sharedWorker.port.removeEventListener('message', shutdownListener)
      disonnectFromSharedWorker()
      log('OK: This page is disconnected and the test is complete')
    }
  }

  sharedWorker.port.addEventListener('message', shutdownListener)
  insertAnchor()
}

async function beginTestForPage2() {
  if (!await initSharedWorker()) { return }

  while (count < 5) {
    if (!await tellSharedWorkerToShutdown()) { return }
    // NOTE: 1000 is arbitrary
    await wait(1000)
    if (!await initSharedWorker()) { return }
  }

  log('OK: Successfully shutdown and reconstructed the SharedWorker many times 🙌')
}

// UTILITY FUNCTIONS
async function initSharedWorker() {
  count += 1
  log('    Attempting to boot the shared worker')

  const def = deferredWithTimeout(3000)

  sharedWorker = new SharedWorker('./shared-worker.js')

  const connectedListener = e => {
    if (e.data === 'connected') {
      def.resolve()
    }
  }

  sharedWorker.port.addEventListener('message', messageLogger)
  sharedWorker.port.addEventListener('message', connectedListener)
  sharedWorker.port.start()

  try {
    await def.promise
    log('    SharedWorker connected')
    return true
  } catch {
    log('NO: SharedWorker failed to connect')
    return false
  } finally {
    sharedWorker.port.removeEventListener('message', connectedListener)
  }
}

function disonnectFromSharedWorker() {
  sharedWorker.port.removeEventListener('message', messageLogger)
  sharedWorker.port.close()
  sharedWorker = null
}

async function tellSharedWorkerToShutdown() {
  if (!sharedWorker) { return }

  log('    Telling the SharedWorker to shutdown')

  const def = deferredWithTimeout(3000)

  const shutdownListener = e => {
    if (e.data === 'shutdown') {
      def.resolve()
    }
  }

  sharedWorker.port.addEventListener('message', shutdownListener)
  sharedWorker.port.postMessage('shutdown')

  try {
    await def.promise
    log('    SharedWorker successfully shutdown')
    return true
  } catch {
    log('NO: SharedWorker timed out during shutdown')
    return false
  } finally {
    sharedWorker.port.removeEventListener('message', shutdownListener)
    disonnectFromSharedWorker()
  }
}

function insertAnchor() {
  url.searchParams.set('w', 'two')

  const anchor = document.createElement('a')
  anchor.href = url.href
  anchor.target = 'blank'
  anchor.innerText = 'Click here to open Page 2 in a new window and continue the test'

  form.innerHTML = ''
  form.append(anchor)
  form.style.display = 'block'
}

function log(msg) {
  pre.innerText += msg + `; count: ${count}\n`
}

function deferredWithTimeout(amount) {
  let resolve, reject

  const promise = new Promise((re, rej) => {
    resolve = re
    reject = rej
    setTimeout(() => rej(new Error('timeout')), amount)
  })

  return {
    resolve,
    reject,
    promise
  }
}

async function wait(amount) {
  return await deferredWithTimeout(amount).promise.catch(() => {})
}

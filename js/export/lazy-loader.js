/**
 * NetMap — Dynamic Script Lazy-Loader
 * Loads heavy export libraries (SheetJS, jsPDF, autotable) on demand to keep initial payload < 250 KB
 */

function loadScript(src) {
  return new Promise((resolve, reject) => {
    // Check if already in DOM
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = (err) => reject(new Error(`Gagal memuat pustaka ekspor: ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * Lazy load SheetJS (XLSX) library
 */
export async function loadSheetJs() {
  if (window.XLSX) return window.XLSX;

  try {
    await loadScript('assets/vendor/xlsx.full.min.js');
  } catch {
    await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
  }
  return window.XLSX;
}

/**
 * Lazy load jsPDF and autoTable plugins
 */
export async function loadJsPdf() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf;

  try {
    await loadScript('assets/vendor/jspdf.umd.min.js');
    await loadScript('assets/vendor/jspdf.plugin.autotable.min.js');
  } catch {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
  }
  return window.jspdf;
}


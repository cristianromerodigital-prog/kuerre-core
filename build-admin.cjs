// build-admin.js
// Uso: node build-admin.js [kuerre|crp|all]
// Genera Productivo/admin.html de cada marca desde CORE/src/admin.html
// Sin dependencias npm — solo fs y path built-in

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const CORE = path.join(ROOT, 'src', 'admin.html');

function applyPatches(html, patches, brandName) {
  for (const patch of patches) {
    if (patch.regex) {
      html = html.replace(new RegExp(patch.regex, patch.flags || 'g'), patch.replace);
    } else {
      if (!html.includes(patch.find)) {
        const preview = patch.find.slice(0, 80).replace(/\n/g, '\\n');
        throw new Error(`[${brandName}] Patch not found:\n  "${preview}..."\n  (patch: ${patch._comment || 'sin nombre'})`);
      }
      html = html.split(patch.find).join(patch.replace);
    }
  }
  return html;
}

function applyContentSection(html, brandDir, sectionFile) {
  const content  = fs.readFileSync(path.join(brandDir, sectionFile), 'utf8').replace(/\r\n/g, '\n');
  const START    = '<!-- @@CONTENT_START -->';
  const END      = '<!-- @@CONTENT_END -->';
  const startIdx = html.indexOf(START);
  const endIdx   = html.indexOf(END) + END.length;
  if (startIdx === -1) throw new Error('@@CONTENT_START marker not found in CORE');
  if (endIdx   === END.length - 1) throw new Error('@@CONTENT_END marker not found in CORE');
  return html.slice(0, startIdx) + content + html.slice(endIdx);
}

function buildBrand(brandName) {
  const brandDir = path.join(ROOT, 'brands', brandName);
  const config   = JSON.parse(fs.readFileSync(path.join(brandDir, 'config.json'), 'utf8'));

  // Normalize to LF so all patches use \n consistently
  let html = fs.readFileSync(CORE, 'utf8').replace(/\r\n/g, '\n');

  // 1. Apply patches
  html = applyPatches(html, config.patches || [], brandName);

  // 2. Replace content section (optional)
  if (config.contentSection) {
    html = applyContentSection(html, brandDir, config.contentSection);
  }

  // 3. Write outputs
  for (const outRel of config.outputs) {
    const outPath = path.resolve(ROOT, '..', outRel);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html, 'utf8');
    console.log(`  → ${outRel}`);
  }

  console.log(`✅ ${brandName} built (${config.outputs.length} file${config.outputs.length !== 1 ? 's' : ''})`);
}

// Entry point
const target = process.argv[2] || 'all';
const brands = target === 'all' ? ['kuerre', 'crp'] : [target];

for (const brand of brands) {
  try {
    buildBrand(brand);
  } catch(e) {
    console.error(`❌ ${brand}: ${e.message}`);
    process.exit(1);
  }
}

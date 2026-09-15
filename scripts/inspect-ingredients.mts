// Live debugging aid for the ingredient sanitizer: fetches products from Open
// Food Facts and prints every structured ingredient row with how
// src/lib/ingredientSanitizer.ts classified it and why. Use it to triage a
// product showing a row that isn't an ingredient, then add that case to
// scripts/check-ingredient-sanitizer.mts.
// Run with: npm run inspect:ingredients -- <barcode> [<barcode> ...]
import { fetchIngredientsByBarcode } from '../src/lib/off.ts';

const barcodes = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
if (barcodes.length === 0) {
  console.log('Usage: npm run inspect:ingredients -- <barcode> [<barcode> ...]');
  process.exit(1);
}

const MARK = { VALID: '✓', UNCERTAIN: '?', OBVIOUS_NOISE: '✗' } as const;

for (const barcode of barcodes) {
  const product = await fetchIngredientsByBarcode(barcode, 'en');
  if (!product) {
    console.log(`\n${barcode}: not found on Open Food Facts`);
    continue;
  }
  const removed = product.ingredientDecisions.filter((d) => d.classification === 'OBVIOUS_NOISE').length;
  console.log(`\n${barcode} — ${product.name} (${product.brand ?? 'no brand'}): ${product.ingredientDecisions.length} rows, ${removed} removed`);
  for (const d of product.ingredientDecisions) {
    console.log(
      `${'  '.repeat(d.depth)}${MARK[d.classification]} ${d.path.padEnd(6)} ${JSON.stringify(d.text)}  [${d.classification} · ${d.rule} · ${d.action}]` +
        `  id=${d.id ?? '-'}${d.isInTaxonomy ? ' (taxonomy)' : ''}  — ${d.reason}`
    );
  }
}

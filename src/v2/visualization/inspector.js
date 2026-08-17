/**
 * Developer provenance inspector (REQ-005E).
 */

import { inspectVisual } from './mirrorState.js';
import { EVIDENCE_LABELS } from '../contracts/evidence.js';

export function inspectActiveVisuals(visualStates) {
  return visualStates.map((state) => {
    const info = inspectVisual(state);
    return {
      ...info,
      userFacingEvidenceLabel: EVIDENCE_LABELS[state.evidenceClass] || state.evidenceClass,
      whyActive: whyActive(state),
    };
  });
}

export function whyActive(state) {
  if (state.evidenceClass === 'unknown' || state.value == null) {
    return `${state.visualName} is inactive because evidence is ${state.unknownBehavior || 'unknown'}.`;
  }
  const sources = (state.sourceFieldPaths || []).join(', ') || 'unspecified sources';
  return `${state.visualName} is active from ${sources} (${state.evidenceClass}, confidence ${state.confidence ?? 'n/a'}).`;
}

export function renderInspectorHtml(visualStates) {
  const rows = inspectActiveVisuals(visualStates).map((row) => `
    <tr>
      <td>${escapeHtml(row.visualName)}</td>
      <td>${escapeHtml(String(row.currentValue))}</td>
      <td>${escapeHtml(row.evidenceClass)}</td>
      <td>${row.confidence ?? ''}</td>
      <td>${escapeHtml(row.whyActive)}</td>
    </tr>`).join('');
  return `<table class="provenance-inspector"><thead><tr>
    <th>visual</th><th>value</th><th>evidence</th><th>confidence</th><th>why</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

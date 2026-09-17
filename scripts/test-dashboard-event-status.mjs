import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dashboardSource = await readFile(new URL('../src/components/admin/AdminDashboard.jsx', import.meta.url), 'utf8');
const eventManagementSource = await readFile(new URL('../src/components/admin/EventManagement.jsx', import.meta.url), 'utf8');

const isOperationalEvent = (event = {}) => !event.completado && event.estado !== 'cancelado';

const activeEvent = { id: 'active', completado: false, estado: 'programado' };
const cancelledEvent = { id: 'cancelled', completado: false, estado: 'cancelado' };
const completedEvent = { id: 'completed', completado: true, estado: 'programado' };

assert.deepEqual([activeEvent, cancelledEvent, completedEvent].filter(isOperationalEvent), [activeEvent]);
assert.equal(isOperationalEvent(cancelledEvent), false);
assert.equal(isOperationalEvent(completedEvent), false);

const pendingInvitations = [
  { ...activeEvent, estadoAsistencia: { user1: 'pendiente' } },
  { ...cancelledEvent, estadoAsistencia: { user1: 'pendiente' } },
].filter(event => isOperationalEvent(event) && event.estadoAsistencia.user1 === 'pendiente');
assert.deepEqual(pendingInvitations.map(event => event.id), ['active']);

assert.match(dashboardSource, /const isOperationalEvent = \(event = \{\}\) => !event\.completado && event\.estado !== 'cancelado';/);
assert.match(dashboardSource, /const activeEvents = docs\.filter\(isOperationalEvent\);/);
assert.match(dashboardSource, /if \(isOperationalEvent\(ev\) && ev\.estadoAsistencia/);
assert.match(eventManagementSource, /const eventosCancelados = eventos\.filter\(e => e\.estado === 'cancelado'\)\.reverse\(\);/);

console.log('dashboard event status isolation: OK');

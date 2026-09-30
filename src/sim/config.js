// Settings form rules. Values are entered in seconds and returned in milliseconds.
export const FIELDS = [
  { key: 'arrivalInterval', label: 'Customer arrival interval', name: 'customer arrival interval', hint: 'how often a new customer arrives', default: 3, min: 0, allowZero: false, max: 600, required: true },
  { key: 'prepTime', label: 'Order fulfilment interval', name: 'order fulfilment interval', hint: 'how long the Cook takes per order', default: 4, min: 0, allowZero: false, max: 600, required: true },
  { key: 'takeTime', label: 'Order taking time', name: 'order taking time', hint: 'how long the Order Taker needs per ticket', default: 2, min: 0, allowZero: true, max: 600, required: true },
  { key: 'deliverTime', label: 'Delivery time', name: 'delivery time', hint: 'how long the Server takes to hand over an order', default: 1, min: 0, allowZero: true, max: 600, required: true },
  { key: 'duration', label: 'Run for', name: 'simulation run time', hint: 'total simulation time; leave blank to run until you press Stop', default: '', min: 0, allowZero: false, max: 86400, required: false },
];

const STAGES = [
  ['takeTime', 'Order Taker'],
  ['prepTime', 'Cook'],
  ['deliverTime', 'Server'],
];

// raw: { fieldKey: string } straight from the form
// Returns { config (ms, or null when invalid), errors: { fieldKey: message }, warnings: [message] }
export function validateSettings(raw) {
  const errors = {};
  const seconds = {};

  for (const field of FIELDS) {
    const text = String(raw[field.key] ?? '').trim();
    const { name } = field;
    if (text === '') {
      if (field.required) errors[field.key] = `Enter the ${name} in seconds, e.g. ${field.default}.`;
      else seconds[field.key] = null;
      continue;
    }
    const value = Number(text);
    if (!Number.isFinite(value)) {
      errors[field.key] = `“${text}” isn't a number. Enter the ${name} in seconds, e.g. ${field.default || 60}.`;
    } else if (value < 0) {
      errors[field.key] = `The ${name} can't be negative.`;
    } else if (value === 0 && !field.allowZero) {
      errors[field.key] = `The ${name} must be more than 0 seconds.`;
    } else if (value > field.max) {
      errors[field.key] = `The ${name} must be ${field.max.toLocaleString()} seconds or less.`;
    } else {
      seconds[field.key] = value;
    }
  }

  if (Object.keys(errors).length) return { config: null, errors, warnings: [] };

  // Not an error, but worth pointing out: if any stage is slower than arrivals, lines grow forever
  const warnings = [];
  const [slowKey, slowName] = STAGES.reduce((a, b) => (seconds[b[0]] > seconds[a[0]] ? b : a));
  if (seconds[slowKey] > seconds.arrivalInterval) {
    warnings.push(
      `Customers arrive every ${seconds.arrivalInterval} s, but the ${slowName} needs ${seconds[slowKey]} s per order, so the lines will keep growing.`
    );
  }

  const ms = (s) => (s === null ? null : Math.round(s * 1000));
  const config = Object.fromEntries(Object.entries(seconds).map(([k, v]) => [k, ms(v)]));
  return { config, errors, warnings };
}

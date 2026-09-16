/** Reading must not silently replace the exercise with a different lesson. */
export function nextLearningStep({ lessons, progress = {}, reviews = {} }, now = Date.now()) {
  const unfinished = lessons.find(({ id }) => {
    const activity = progress[id] || {};
    return (activity.read || activity.attempted) && (!activity.read || !activity.attempted || !reviews[id]);
  });
  const lesson = unfinished || lessons.find(({ id }) => !progress[id]?.read || !progress[id]?.attempted);
  if (lesson) {
    const activity = progress[lesson.id] || {};
    return { lesson, stage: !activity.read ? 'read' : !activity.attempted ? 'try' : 'review' };
  }
  const due = lessons.find(({ id }) => progress[id]?.read && progress[id]?.attempted && (!reviews[id] || reviews[id].due <= now));
  return due ? { lesson: due, stage: 'review' } : { lesson: null, stage: 'done' };
}

/** Display/copy only an exact HTTPS origin, never a credential-bearing URL. */
export function phoneAddress(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const loopback = host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || host === '[::ffff:7f00:1]' || host === '0.0.0.0' || host.startsWith('127.');
    return url.protocol === 'https:' && url.origin === value && !url.username && !url.password && !loopback ? url.origin : '';
  } catch { return ''; }
}
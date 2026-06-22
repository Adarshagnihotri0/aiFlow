import 'dotenv/config';
import app from './server';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

app.listen(PORT, () => {
  console.log(''); // eslint-disable-line no-console
  console.log('  Bedrock proxy running'); // eslint-disable-line no-console
  console.log(`  http://localhost:${PORT}`); // eslint-disable-line no-console
  console.log(''); // eslint-disable-line no-console
  console.log('  To use with Claude Code:'); // eslint-disable-line no-console
  console.log(`    export ANTHROPIC_BASE_URL=http://localhost:${PORT}`); // eslint-disable-line no-console
  console.log('    export ANTHROPIC_API_KEY=dummy'); // eslint-disable-line no-console
  console.log('    claude'); // eslint-disable-line no-console
  console.log(''); // eslint-disable-line no-console
}); 

import 'dotenv/config';
import app from './server';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

app.listen(PORT, () => {
  console.log('');
  console.log('  Bedrock proxy running');
  console.log(`  http://localhost:${PORT}`);
  console.log('');
  console.log('  To use with Claude Code:');
  console.log(`    export ANTHROPIC_BASE_URL=http://localhost:${PORT}`);
  console.log('    export ANTHROPIC_API_KEY=dummy');
  console.log('    claude');
  console.log('');
}); 

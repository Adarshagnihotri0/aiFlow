#!/usr/bin/env node

import { Command } from 'commander';
import axios from 'axios';
import chalk from 'chalk';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { execSync } from 'child_process';

const program = new Command();

program
  .name('airuntime')
  .description('AI Runtime CLI - Get project context for AI assistants')
  .version('0.1.0');

/**
 * prep - Get AI-ready context (NO SETUP REQUIRED)
 */
program
  .command('prep')
  .description('Get AI context for current project')
  .option('-j, --json', 'Output as JSON')
  .option('-d, --deep', 'Include file previews (first 20 lines)')
  .option('-s, --server <url>', 'Runtime server URL', 'http://localhost:3001')
  .action(async (options) => {
    try {
      const projectRoot = process.cwd();
      
      // Call daemon with project root
      const response = await axios.get(`${options.server}/api/v1/context`, {
        params: { 
          root: projectRoot,
          deep: options.deep || false
        }
      });
      
      const context = response.data;
      
      if (options.json) {
        console.log(JSON.stringify(context, null, 2));
      } else {
        console.log(formatMarkdown(context));
      }
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.error(chalk.red('Error: Cannot connect to AI Runtime server'));
        console.error(chalk.dim('Start it with: npm start (in mcp2.0 directory)'));
      } else {
        console.error(chalk.red('Error:'), error.message);
      }
      process.exit(1);
    }
  });

/**
 * trace - Get trace details
 */
program
  .command('trace <id>')
  .description('Get trace details')
  .option('-s, --server <url>', 'Runtime server URL', 'http://localhost:3001')
  .action(async (id, options) => {
    try {
      const response = await axios.get(`${options.server}/api/v1/traces/${id}`);
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

/**
 * init - Create .airuntime directory (OPTIONAL)
 */
program
  .command('init')
  .description('Create .airuntime directory for customization')
  .action(() => {
    const airuntimeDir = join(process.cwd(), '.airuntime');
    
    if (existsSync(airuntimeDir)) {
      console.log(chalk.yellow('.airuntime directory already exists'));
      return;
    }
    
    mkdirSync(airuntimeDir);
    
    const config = {
      project: basename(process.cwd()),
      runtime: {
        server: 'http://localhost:3001'
      }
    };
    
    writeFileSync(
      join(airuntimeDir, 'config.json'),
      JSON.stringify(config, null, 2)
    );
    
    writeFileSync(
      join(airuntimeDir, 'memory.md'),
      '# Project Memory\n\nAdd project-specific notes here.\n'
    );
    
    console.log(chalk.green('✓ Created .airuntime/'));
    console.log(chalk.dim('  - config.json (project config)'));
    console.log(chalk.dim('  - memory.md (project notes)'));
  });

program.parse();

/**
 * Format context as Markdown for AI assistants
 */
function formatMarkdown(ctx: any): string {
  let md = `# Project: ${ctx.project.name}\n\n`;
  
  // Git status
  md += `## Git Status\n`;
  md += `Branch: ${ctx.git.branch}\n`;
  if (ctx.git.status) {
    md += `Changes:\n\`\`\`\n${ctx.git.status}\n\`\`\`\n`;
  } else {
    md += `Working tree clean\n`;
  }
  md += '\n';
  
  // Important files
  if (ctx.important_files && ctx.important_files.length > 0) {
    md += `## Important Files (${ctx.important_files.length})\n`;
    ctx.important_files.forEach((file: any) => {
      if (typeof file === 'string') {
        md += `- ${file}\n`;
      } else {
        const lineInfo = file.lines ? ` (${file.lines} lines)` : '';
        const entryPointMarker = file.is_entry_point ? ' [ENTRY POINT]' : '';
        md += `- ${file.path}${lineInfo}${entryPointMarker}\n`;        
        // Show preview if available
        if (file.preview) {
          md += '```\n' + file.preview + '\n```\n';
        }      }
    });
    md += '\n';
  }
  
  // Dependencies
  if (ctx.dependencies) {
    const prod = ctx.dependencies.production || [];
    const dev = ctx.dependencies.development || [];
    
    if (prod.length > 0 || dev.length > 0) {
      md += `## Dependencies\n`;
      if (prod.length > 0) {
        md += `**Production:** ${prod.join(', ')}\n`;
      }
      if (dev.length > 0) {
        md += `**Development:** ${dev.join(', ')}\n`;
      }
      md += '\n';
    }
  }
  
  // Recent traces
  if (ctx.traces.length > 0) {
    md += `## Recent Traces (${ctx.traces.length})\n`;
    ctx.traces.forEach((t: any) => {
      const status = t.status === 'error' ? '❌' : '✓';
      md += `- ${status} ${t.route}: ${t.total_ms}ms\n`;
    });
    md += '\n';
  }
  
  // Warnings
  if (ctx.warnings.length > 0) {
    md += `## ⚠️ Warnings\n`;
    ctx.warnings.forEach((w: string) => {
      md += `- ${w}\n`;
    });
    md += '\n';
  }
  
  // Recommendations
  if (ctx.recommendations.length > 0) {
    md += `## 💡 Recommendations\n`;
    ctx.recommendations.forEach((r: string) => {
      md += `- ${r}\n`;
    });
    md += '\n';
  }
  
  md += '---\nReady for AI assistance.\n';
  
  return md.trim();
}

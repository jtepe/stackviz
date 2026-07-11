import type { Program } from './ast';
import type { Diagnostic } from './diagnostics';
import { parse } from './parser';
import { check, type CheckedProgram } from './checker';

export interface Analysis {
  source: string;
  program: Program;
  checked: CheckedProgram;
  diagnostics: Diagnostic[];
}

export function analyze(source: string): Analysis {
  const { program, diagnostics: parseDiagnostics } = parse(source);
  const { checked, diagnostics: checkDiagnostics } = check(program);
  return {
    source,
    program,
    checked,
    diagnostics: [...parseDiagnostics, ...checkDiagnostics],
  };
}

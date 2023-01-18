import type { API, FileInfo } from 'jscodeshift';
import jscodeshift from 'jscodeshift';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import transform from '..';

describe('@redwoodjs/core v4 auth-decoder', function () {
    it('should add auth-decoder', async function () {
        const input = await readFile(
            join(__dirname, 'input.js'),
            { encoding: 'utf8' }
        );

        const output = await readFile(
            join(__dirname, 'output.js'),
            { encoding: 'utf8' }
        );

        const fileInfo: FileInfo = {
			path: 'index.js',
			source: input,
		};

        const buildApi = (parser: string): API => ({
            j: jscodeshift.withParser(parser),
            jscodeshift: jscodeshift.withParser(parser),
            stats: () => {
                console.error(
                    'The stats function was called, which is not supported on purpose',
                );
            },
            report: () => {
                console.error(
                    'The report function was called, which is not supported on purpose',
                );
            },
        });

        transform(
            fileInfo,
            buildApi('tsx'),
            {},
        )
    }) 
});
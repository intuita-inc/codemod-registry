import { API, FileInfo, Options, Transform } from 'jscodeshift';

export default function transformer(
	file: FileInfo,
	api: API,
	options: Options,
) {
	const j = api.jscodeshift;

	const root = j(file.source);

	let dirtyFlag = false;

	root.find(j.JSXElement, {
		type: 'JSXElement',
		openingElement: {
			type: 'JSXOpeningElement',
			name: { type: 'JSXIdentifier', name: 'style' },
		},
	}).forEach((jsxElementPath) => {
		const parentPath: typeof jsxElementPath = jsxElementPath.parentPath; // todo how to ensure the correct types?

		if (parentPath?.node?.type !== 'JSXElement') {
			return;
		}

		parentPath.node.openingElement.attributes =
			parentPath.node.openingElement.attributes ?? [];

		parentPath.node.openingElement.attributes.push(
			j.jsxAttribute(
				j.jsxIdentifier('className'),
				j.jsxExpressionContainer(
					j.memberExpression(
						j.literal('styles'),
						j.literal('wrapper'),
					),
				),
			),
		);

		const cssSource = j(jsxElementPath.value.children ?? [])
			.toSource()
			.replace('{`', '')
			.replace('`}', '');

		jsxElementPath.replace();

		if ('createFile' in options) {
			options.createFile('a', cssSource);
		}

		dirtyFlag = true;
	});

	if (!dirtyFlag) {
		return undefined;
	}

	const importDeclaration = j.importDeclaration(
		[j.importSpecifier(j.identifier('styles'), j.identifier('styles'))],
		j.stringLiteral('index.module.css'),
	);

	root.find(j.Program).forEach((program) => {
		program.value.body.unshift(importDeclaration);
	});

	return root.toSource();
}

transformer satisfies Transform;

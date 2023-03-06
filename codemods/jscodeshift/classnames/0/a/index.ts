import type {
	FileInfo,
	API,
	Options,
	LogicalExpression,
	Identifier,
} from 'jscodeshift';

type ExpressionKind = LogicalExpression['left'];

// this is the entry point for a JSCodeshift codemod
export default function transform(
	file: FileInfo,
	api: API,
	options: Options,
): string | undefined {
	const j = api.jscodeshift;
	const root = j(file.source);

	root.find(j.CallExpression, {
		type: 'CallExpression',
		callee: {
			type: 'Identifier',
			name: 'ctl',
		},
	}).forEach((cePath) => {
		const ceCollection = j(cePath);

		const identifiers: Identifier[] = [];
		const literals: string[] = [];
		const objectExpressions: [ExpressionKind, ExpressionKind][] = [];

		ceCollection.find(j.TemplateElement).forEach((tePath) => {
			const templateElement = tePath.node;

			const names = templateElement.value.raw
				.split(/\s/)
				.map((str) => str.trim())
				.filter((str) => str !== '');

			literals.push(...names);
		});

		ceCollection.find(j.TemplateLiteral).forEach((tlPath) => {
			const templateLiteral = tlPath.node;

			templateLiteral.expressions.forEach((expressionKind) => {
				if (expressionKind.type === 'Identifier') {
					identifiers.push(expressionKind);
				}
			});
		});

		ceCollection
			.find(j.LogicalExpression, {
				type: 'LogicalExpression',
				operator: '&&',
				right: {
					type: 'StringLiteral',
				},
			})
			.forEach((lePath) => {
				const { left, right } = lePath.node;

				objectExpressions.push([left, right]);
			});

		ceCollection.replaceWith(
			j.expressionStatement(
				j.callExpression(j.identifier('cn'), [
					...identifiers,
					...literals.map((e) => j.literal(e)),
					...objectExpressions.map(([left, right]) => ({
						type: 'ObjectExpression' as const,
						properties: [
							{
								type: 'ObjectProperty' as const,
								key: right,
								value: left,
							},
						],
					})),
				]),
			),
		);
	});

	root.find(j.ImportDeclaration, {
		type: 'ImportDeclaration',
		importKind: 'value',
		specifiers: [
			{
				type: 'ImportDefaultSpecifier',
				local: {
					type: 'Identifier',
					name: 'ctl',
				},
			},
		],
		source: {
			type: 'StringLiteral',
			extra: {
				rawValue: '@netlify/classnames-template-literals',
				raw: "'@netlify/classnames-template-literals'",
			},
			value: '@netlify/classnames-template-literals',
		},
	}).replaceWith({
		type: 'ImportDeclaration',
		importKind: 'value',
		specifiers: [
			{
				type: 'ImportDefaultSpecifier',
				local: { type: 'Identifier', name: 'cn' },
			},
		],
		source: { type: 'StringLiteral', value: 'classnames' },
	});

	return root.toSource();
}

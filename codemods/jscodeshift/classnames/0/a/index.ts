import type { FileInfo, API, Options, LogicalExpression } from 'jscodeshift';

type ExpressionKind = LogicalExpression['left'];

// this is the entry point for a JSCodeshift codemod
export default function transform(
	file: FileInfo,
	api: API,
	options: Options,
): string | undefined {
	const j = api.jscodeshift;
	const root = j(file.source);

	const ceCollection = root.find(j.CallExpression, {
		type: 'CallExpression',
		callee: {
			type: 'Identifier',
			name: 'ctl',
		},
	});

	const elements: string[] = [];
	const objectExpressions: [ExpressionKind, ExpressionKind][] = [];

	ceCollection.find(j.TemplateElement).forEach((TemplateElementPath) => {
		const templateElement = TemplateElementPath.node;

		const names = templateElement.value.raw
			.split(/\s/)
			.map((s) => s.trim())
			.filter((x) => x !== '');

		elements.push(...names);
	});

	root.find(j.LogicalExpression, {
		type: 'LogicalExpression',
		operator: '&&',
		right: {
			type: 'StringLiteral',
		},
	}).forEach((lePath) => {
		const le = lePath.node;

		le.left;

		objectExpressions.push([le.left, le.right]);
	});

	ceCollection.replaceWith(
		j.expressionStatement(
			j.callExpression(j.identifier('cn'), [
				...elements.map((e) => j.literal(e)),
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

	return root.toSource();
}

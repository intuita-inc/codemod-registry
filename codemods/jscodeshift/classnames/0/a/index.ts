import type {
	FileInfo,
	API,
	Options,
	LogicalExpression,
	TemplateLiteral,
	StringLiteral,
	Literal,
	Identifier,
} from 'jscodeshift';

type ExpressionKind = LogicalExpression['left'];

type ObjectExpression = {
	left: ExpressionKind;
	right: StringLiteral | Literal | Identifier;
};

const getLiteralsFromTemplateLiteral = (
	templateLiteral: TemplateLiteral,
): ReadonlyArray<string> => {
	return templateLiteral.quasis.flatMap((templateElement) => {
		return templateElement.value.raw
			.split(/\s/)
			.map((str) => str.trim())
			.filter((str) => str !== '');
	});
};

// this is the entry point for a JSCodeshift codemod
export default function transform(
	file: FileInfo,
	api: API,
	options: Options,
): string | undefined {
	const j = api.jscodeshift;
	const root = j(file.source);

	let dirtyFlag = false;

	root.find(j.CallExpression, {
		type: 'CallExpression',
		callee: {
			type: 'Identifier',
			name: 'ctl',
		},
	}).forEach((cePath) => {
		const ceCollection = j(cePath);

		const handleTemplateLiteral = (templateLiteral: TemplateLiteral) => {
			const identifiers: Identifier[] = [];

			const literals = getLiteralsFromTemplateLiteral(templateLiteral);

			const objectExpressions = templateLiteral.expressions.flatMap(
				(expression): ObjectExpression[] => {
					if (expression.type === 'Identifier') {
						identifiers.push(expression);
					}

					if (expression.type === 'LogicalExpression') {
						if (expression.right.type === 'TemplateLiteral') {
							const returns = handleTemplateLiteral(
								expression.right,
							);

							return [
								...returns.identifiers.map((identifier) => {
									return {
										left: expression.left,
										right: identifier,
									};
								}),
								...returns.literals.map((name) => {
									return {
										left: expression.left,
										right: j.literal(name),
									};
								}),
								...returns.objectExpressions.map(
									({ left, right }) => {
										return {
											left: j.logicalExpression(
												'&&',
												left,
												expression.left,
											),
											right,
										};
									},
								),
							];
						}

						if (expression.right.type === 'StringLiteral') {
							return [
								{
									left: expression.left,
									right: expression.right,
								},
							];
						}
					}

					return [];
				},
			);

			return {
				identifiers,
				literals,
				objectExpressions,
			};
		};

		const identifiers: Identifier[] = [];
		const literals: string[] = [];
		const objectExpressions: ObjectExpression[] = [];

		cePath.node.arguments.forEach((argument) => {
			if (argument.type === 'TemplateLiteral') {
				const returns = handleTemplateLiteral(argument);

				identifiers.push(...returns.identifiers);
				literals.push(...returns.literals);
				objectExpressions.push(...returns.objectExpressions);
			}
		});

		dirtyFlag = true;

		if (
			identifiers.length === 0 &&
			literals.length === 0 &&
			objectExpressions.length === 0
		) {
			cePath.replace(
				j.callExpression(j.identifier('cn'), [
					...cePath.node.arguments,
				]),
			);
		} else {
			cePath.replace(
				j.callExpression(j.identifier('cn'), [
					...identifiers,
					...literals.map((e) => j.literal(e)),
					...objectExpressions.map(({ left, right }) => ({
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
			);
		}
	});

	const cnIdCollection = root.find(j.ImportDeclaration, {
		type: 'ImportDeclaration',
		importKind: 'value',
		specifiers: [
			{
				type: 'ImportDefaultSpecifier',
				local: {
					type: 'Identifier',
					name: 'cn',
				},
			},
		],
		source: {
			type: 'StringLiteral',
			value: 'classnames',
		},
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
			value: '@netlify/classnames-template-literals',
		},
	}).replaceWith(() => {
		dirtyFlag = true;

		return {
			type: 'ImportDeclaration',
			importKind: 'value',
			specifiers: [
				{
					type: 'ImportDefaultSpecifier',
					local: { type: 'Identifier', name: 'cn' },
				},
			],
			source: { type: 'StringLiteral', value: 'classnames' },
		};
	});

	if (cnIdCollection.size() !== 0) {
		cnIdCollection.remove();
	}

	if (!dirtyFlag) {
		return undefined;
	}

	return root.toSource();
}

import { API, FileInfo, Options, JSCodeshift } from 'jscodeshift';

const CLASSNAMES_IDENTIFIER_NAME = 'cx';

const getClassNames = (string: string) => {
	return string
		.trim()
		.split(/\s/)
		.filter((name) => name.length > 0);
};

const isFalsyNodeValue = (node) =>
	(node.type === 'Literal' && !node.value) ||
	node.type === 'NullLiteral' ||
	(node.type === 'Identifier' && node.name === 'undefined');

const _createObjectExpression = (j: JSCodeshift) => (entries) => {
	return j.objectExpression(
		entries.map(([property, value]) =>
			j.objectProperty.from({
				key: property,
				value,
				computed: true,
			}),
		),
	);
};

const _createLiteral = (j: JSCodeshift) => (className) => {
	return j.literal(className);
};

const _createCxCallExpression =
	(j: JSCodeshift) => (args, classNamesIdentifier) => {
		return j.callExpression(j.identifier(classNamesIdentifier), args);
	};

const _createImportDeclaration =
	(j: JSCodeshift) => (identifierName, source) => {
		return j.importDeclaration(
			[j.importDefaultSpecifier(j.identifier(identifierName))],
			j.stringLiteral(source),
		);
	};

const _getLastLibImport = (j: JSCodeshift) => (ast) => {
	let firstImport = null;
	let lastLibImport = null;
	const importDeclarations = ast.find(j.ImportDeclaration);

	importDeclarations.forEach((path, i) => {
		const importSource = path.node.source.value;
		if (i === 0) {
			firstImport = path;
		}
		if (importSource.charAt(0) !== '.') {
			lastLibImport = path;
		}
	});
	return lastLibImport || firstImport;
};

const _getClassNamesIdentifierName = (j: JSCodeshift) => (ast) => {
	const importDeclarations = ast.find(j.ImportDeclaration, {
		type: 'ImportDeclaration',
		source: {
			value: 'classnames',
		},
	});

	if (importDeclarations.length === 1) {
		const importDeclaration = importDeclarations.get();
		const defaultImport = j(importDeclaration)
			.find(j.ImportDefaultSpecifier)
			.get();

		return defaultImport.node.local.name;
	}
	return null;
};

export default function transformer(
	fileInfo: FileInfo,
	api: API,
	options: Options,
) {
	const filePath = fileInfo.path;
	const j = api.jscodeshift;
	const createLiteral = _createLiteral(j);
	const createCxCallExpression = _createCxCallExpression(j);
	const createImportDeclaration = _createImportDeclaration(j);
	const createObjectExpression = _createObjectExpression(j);
	const getClassNamesIdentifierName = _getClassNamesIdentifierName(j);

	const ast = j(fileInfo.source);

	const transformLogicalExp = options.hasOwnProperty('logicalExp');
	const transformConditionalExpression =
		options.hasOwnProperty('conditionalExp');
	const transformFalsyConditionalExp = options.hasOwnProperty(
		'falsyConditionalExp',
	);
	const classAttrName = [
		'className',
		...(options.classAttrName || '').split(','),
	];

	const existingClassNamesImportIdentifer = getClassNamesIdentifierName(ast);
	const classNamesImportName =
		existingClassNamesImportIdentifer ||
		options.classnamesImport ||
		CLASSNAMES_IDENTIFIER_NAME;

	const lastLibImport = _getLastLibImport(j)(ast);
	let shouldInsertCXImport = false;

	classAttrName.forEach((classAttrName) => {
		const classNameAttrs = ast.find(j.JSXAttribute, {
			type: 'JSXAttribute',
			name: {
				type: 'JSXIdentifier',
				name: classAttrName,
			},
			value: {
				type: 'JSXExpressionContainer',
				expression: {
					type: 'TemplateLiteral',
				},
			},
		});

		// Perform in place replace
		classNameAttrs.forEach((path) => {
			const templateLiteral = j(path).find(j.TemplateLiteral).get();
			let cxArguments = [];
			const { quasis, expressions } = templateLiteral.node;
			quasis.forEach((quasi, index) => {
				const classNames = getClassNames(quasi.value.raw);
				cxArguments.push(...classNames.map(createLiteral));
				if (expressions[index] !== undefined) {
					cxArguments.push(expressions[index]);
				}
			});

			let shouldUseCX = cxArguments.length > 1;

			if (transformLogicalExp) {
				cxArguments = cxArguments.map((arg) => {
					if (arg.type === 'LogicalExpression') {
						shouldUseCX = true;
						return createObjectExpression([[arg.right, arg.left]]);
					}
					return arg;
				});
			}

			if (transformConditionalExpression) {
				cxArguments = cxArguments.map((arg) => {
					if (arg.type === 'ConditionalExpression') {
						shouldUseCX = true;

						const optionalLogicalExpression = (
							previousCondition,
							currentCondition,
						) => {
							if (previousCondition === null) {
								return currentCondition;
							}
							return j.logicalExpression(
								'&&',
								previousCondition,
								currentCondition,
							);
						};

						const transformConditionalExpression = (
							expression,
							previousCondition = null,
						) => {
							const expressionsList = [];

							const currentCondition = optionalLogicalExpression(
								previousCondition,
								expression.test,
							);
							const currentNegatedCondition =
								optionalLogicalExpression(
									previousCondition,
									j.unaryExpression('!', expression.test),
								);

							if (
								expression.consequent.type ===
								'ConditionalExpression'
							) {
								expressionsList.push(
									...transformConditionalExpression(
										expression.consequent,
										currentCondition,
									),
								);
							} else if (
								!isFalsyNodeValue(expression.consequent)
							) {
								expressionsList.push([
									expression.consequent,
									currentCondition,
								]);
							}
							if (
								expression.alternate.type ===
								'ConditionalExpression'
							) {
								expressionsList.push(
									...transformConditionalExpression(
										expression.alternate,
										currentNegatedCondition,
									),
								);
							} else if (
								!isFalsyNodeValue(expression.alternate)
							) {
								expressionsList.push([
									expression.alternate,
									currentNegatedCondition,
								]);
							}
							return expressionsList;
						};

						return createObjectExpression(
							transformConditionalExpression(arg),
						);
					}
					return arg;
				});
			}

			if (shouldUseCX) {
				j(templateLiteral).replaceWith(
					createCxCallExpression(cxArguments, classNamesImportName),
				);
				shouldInsertCXImport = true;
			} else {
				const className = cxArguments[0];
				if (className.type === 'Literal') {
					j(templateLiteral)
						.closest(j.JSXExpressionContainer)
						.replaceWith(className);
				} else {
					j(templateLiteral).replaceWith(className);
				}
			}
		});

		if (transformFalsyConditionalExp) {
			const classNameAttrs = ast.find(j.JSXAttribute, {
				type: 'JSXAttribute',
				name: {
					type: 'JSXIdentifier',
					name: classAttrName,
				},
				value: {
					type: 'JSXExpressionContainer',
					expression: {
						type: 'ConditionalExpression',
					},
				},
			});
			classNameAttrs.forEach((path) => {
				const conditionalExpression = j(path)
					.find(j.ConditionalExpression)
					.get();
				const conditionalExpressionNode = conditionalExpression.node;
				if (isFalsyNodeValue(conditionalExpressionNode.consequent)) {
					shouldInsertCXImport = true;
					j(conditionalExpression).replaceWith(
						createCxCallExpression(
							[
								createObjectExpression([
									[
										conditionalExpressionNode.alternate,
										j.unaryExpression(
											'!',
											conditionalExpressionNode.test,
										),
									],
								]),
							],
							classNamesImportName,
						),
					);
				}

				if (isFalsyNodeValue(conditionalExpressionNode.alternate)) {
					shouldInsertCXImport = true;
					j(conditionalExpression).replaceWith(
						createCxCallExpression(
							[
								createObjectExpression([
									[
										conditionalExpressionNode.consequent,
										conditionalExpressionNode.test,
									],
								]),
							],
							classNamesImportName,
						),
					);
				}
			});
		}
	});

	if (!existingClassNamesImportIdentifer && shouldInsertCXImport) {
		lastLibImport.insertAfter(
			createImportDeclaration(classNamesImportName, 'classnames'),
		);
	}
	return ast.toSource(options);
}

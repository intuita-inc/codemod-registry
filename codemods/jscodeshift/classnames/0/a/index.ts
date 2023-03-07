import type {
    FileInfo,
    API,
    Options,
    LogicalExpression,
    TemplateLiteral,
	StringLiteral,
	Literal,
} from 'jscodeshift';

type ExpressionKind = LogicalExpression['left'];

type ObjectExpression = {left: ExpressionKind, right: (StringLiteral | Literal) }

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
            const literals = getLiteralsFromTemplateLiteral(templateLiteral);

            const objectExpressions = templateLiteral.expressions.flatMap((expression): ObjectExpression[] => {
                if (expression.type === 'LogicalExpression') {
                    if (expression.right.type === 'TemplateLiteral') {
                        //handleTemplateLiteral(expression.right);

                        return getLiteralsFromTemplateLiteral(expression.right)
                            .map((name) => {
                                return ({
									left: expression.left,
                                    right: j.literal(name),
								});
                            });
                    }

                    if (expression.right.type === 'StringLiteral') {
                        return [(
							{
								left: expression.left,
								right: expression.right,
							}
                        )];
                    }
                }

				return [];
            });

			return {
				literals,
				objectExpressions,
			}
        };

        const literals: string[] = [];
        const objectExpressions: ObjectExpression[] = [];

        cePath.node.arguments.forEach((argument) => {
            if (argument.type === 'TemplateLiteral') {
                const returns = handleTemplateLiteral(argument);

				literals.push(...returns.literals);
				objectExpressions.push(...returns.objectExpressions);
            }
        });

        ceCollection.replaceWith(() => {
            dirtyFlag = true;

            return j.callExpression(j.identifier('cn'), [
                ...literals.map((e) => j.literal(e)),
                ...objectExpressions.map(( { left, right }) => ({
                    type: 'ObjectExpression' as const,
                    properties: [
                        {
                            type: 'ObjectProperty' as const,
                            key: right,
                            value: left,
                        },
                    ],
                })),
            ]);
        });
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

    if (!dirtyFlag) {
        return undefined;
    }

    return root.toSource();
}

                }
            });
        };

        const literals: string[] = [];
        const objectExpressions: [ExpressionKind, ExpressionKind][] = [];

        cePath.node.arguments.forEach((argument) => {
            if (argument.type === 'TemplateLiteral') {
                handleTemplateLiteral(argument);
            }
        });

        ceCollection.replaceWith(() => {
            dirtyFlag = true;

            return j.callExpression(j.identifier('cn'), [
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
            ]);
        });
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

    if (!dirtyFlag) {
        return undefined;
    }

    return root.toSource();
}

// Server API makes it possible to hook into various parts of Gridsome
// on server-side and add custom data to the GraphQL data layer.
// Learn more: https://gridsome.org/docs/server-api/

// Changes here require a server restart.
// To restart press CTRL + C in terminal and run `gridsome develop`

const fs = require('fs');
const path = require('path');
const { createAgent } = require('notionapi-agent');
const { getOnePageAsTree, getAllBlocksInOnePage } = require('nast-util-from-notionapi');

module.exports = function (api) {
  api.loadSource(async ({ addSchemaTypes, addSchemaResolvers }) => {
    addSchemaTypes(`
      type Post implements Node {
        id: ID!
        slug: String!
        title: String!
        part: String
        link: String!
        createdAt: Date!
        previousPostTitle: String
        previousPostLink: String
        nextPostTitle: String
        nextPostLink: String
      }
    `);
  });

  api.createPages(async ({ graphql, createPage }) => {
    // Use the Pages API here: https://gridsome.org/docs/pages-api/

    const agent = createAgent({ token: process.env.NOTION_TOKEN });

    // Examples pages
    createPage({
      path: '/examples',
      component: './src/templates/Examples.vue',
    });

    const { data: examplesData } = await graphql(`
      {
        examples: allExample {
          edges {
            node {
              id
              slug
              title
            }
          }
        }
      }
    `);

    examplesData.examples.edges.forEach(({ node }) => {
      createPage({
        path: `/examples/${node.slug}`,
        component: './src/templates/Example.vue',
        context: {
          id: node.id,
          breadcrumbs: [
            {
              path: 'examples',
              to: '/examples/',
              text: 'Examples',
            },
            {
              path: `examples/${node.slug}`,
              to: `/examples/${node.slug}/`,
              text: node.title,
            },
          ],
        },
      });
    });

    // Posts pages
    const postsPageId = process.env.NOTION_POSTS_PAGE_ID;

    try {
      const postsPageblocks = await getAllBlocksInOnePage(postsPageId, agent);

      postsPageblocks.forEach(async (block) => {
        if (block.type === 'page' && block.id !== postsPageId) {
          const postPageId = block.id;

          try {
            const postTree = await getOnePageAsTree(postPageId, agent);

            let postFileName = postPageId;
            let frontmatter = '';
            let content = '';

            // Save page tree in file
            // try {
            //   fs.writeFileSync(
            //     path.join(__dirname, `/${postFileName}.json`),
            //     JSON.stringify(postTree),
            //     { encoding: 'utf-8' },
            //   );
            // } catch (error) {
            //   console.error(`Error while writing file to path "${postFileName}.json": `, error);
            // }

            postTree.children.forEach((child) => {
              // Paragraph
              if (child.type === 'text') {
                if (child.title.length) {
                  child.title.forEach((titlePart) => {
                    if (titlePart.length === 2 && titlePart[1][0][0] === 'b') {
                      // Bold
                      content += `__${titlePart[0]}__`;
                    } else {
                      // Regular
                      content += titlePart[0];
                    }
                  });

                  content += '\n\n';
                } else {
                  content += '\n';
                }
              }

              // Heading
              if (child.type === 'heading') {
                content += `${'#'.repeat(child.depth)} `;

                child.title.forEach((titlePart) => {
                  content += titlePart[0];
                });

                content += '\n\n';
              }

              // Bullet list
              if (child.type === 'bulleted_list') {
                content += '* ';

                child.title.forEach((titlePart) => {
                  if (titlePart.length === 2 && titlePart[1][0][0] === 'b') {
                    // Bold
                    content += `__${titlePart[0]}__`;
                  } else {
                    // Regular
                    content += titlePart[0];
                  }
                });

                content += '\n';

                // Nested bullet list
                if (child.children.length) {
                  child.children.forEach((nestedBulletListChild) => {
                    content += '    * ';

                    nestedBulletListChild.title.forEach((titlePart) => {
                      if (titlePart.length === 2 && titlePart[1][0][0] === 'b') {
                        // Bold
                        content += `__${titlePart[0]}__`;
                      } else {
                        // Regular
                        content += titlePart[0];
                      }
                    });

                    content += '\n';
                  });
                }
              }

              // Numbered list
              if (child.type === 'numbered_list') {
                content += '1. ';

                child.title.forEach((titlePart) => {
                  if (titlePart.length === 2 && titlePart[1][0][0] === 'b') {
                    // Bold
                    content += `__${titlePart[0]}__`;
                  } else {
                    // Regular
                    content += titlePart[0];
                  }
                });

                content += '\n';

                // Nested numbered list
                if (child.children.length) {
                  child.children.forEach((nestedChild) => {
                    if (nestedChild.type === 'numbered_list') {
                      content += '    1. ';
                    } else if (nestedChild.type === 'bulleted_list') {
                      content += '    * ';
                    }

                    nestedChild.title.forEach((titlePart) => {
                      if (titlePart.length === 2 && titlePart[1][0][0] === 'b') {
                        // Bold
                        content += `__${titlePart[0]}__`;
                      } else {
                        // Regular
                        content += titlePart[0];
                      }
                    });

                    content += '\n';
                  });
                }
              }

              // Divider
              if (child.type === 'divider') {
                content += '---';
                content += '\n';
              }

              // Link
              if (Array.isArray(child.title) && child.title.length) {
                child.title.forEach((titlePart) => {
                  if (titlePart.length === 2 && titlePart[1][0][0] === 'a') {
                    content = content.replace(titlePart[0], `[${titlePart[0]}](${titlePart[1][0][1]})`);
                  }
                });
              }

              // Frontmatter
              if (child.type === 'collection_inline') {
                frontmatter += '---';
                frontmatter += '\n';

                child.children.forEach((nestedChild) => {
                  frontmatter += `${nestedChild.properties.title[0][0]}: ${nestedChild.properties.PJ38[0][0]}`;
                  frontmatter += '\n';

                  if (nestedChild.properties.title[0][0] === 'slug') {
                    postFileName = nestedChild.properties.PJ38[0][0];
                  }
                });

                frontmatter += '---';
                frontmatter += '\n';
              }
            });

            // Set frontmatter before content
            content = frontmatter.concat(content);

            try {
              fs.writeFileSync(
                path.join(__dirname, `/content/posts/${postFileName}.md`),
                content,
                { encoding: 'utf-8' },
              );
            } catch (error) {
              console.error(`Error while writing file to path "/content/posts/${postFileName}.md": `, error);
            }
          } catch (error) {
            console.error('Error while trying to get Notion page tree: ', error);
          }
        }
      });
    } catch (error) {
      console.error('Error while trying to get Notion page blocks: ', error);
    }

    createPage({
      path: '/blog',
      component: './src/templates/Posts.vue',
    });

    const { data: postsData } = await graphql(`
      {
        posts: allPost {
          edges {
            node {
              id
              slug
            }
          }
        }
      }
    `);

    if (postsData) {
      postsData.posts.edges.forEach(({ node }) => {
        createPage({
          path: `/blog/${node.slug}`,
          component: './src/templates/Post.vue',
          context: {
            id: node.id,
          },
        });
      });
    }

    // Contributed
    const contributedProjectsPageId = process.env.NOTION_CONTRIBUTED_PROJECTS_PAGE_ID;

    try {
      const contributedProjectsBlocks = await getAllBlocksInOnePage(contributedProjectsPageId, agent);

      contributedProjectsBlocks.forEach(async (block) => {
        if (block.type === 'page' && block.id !== contributedProjectsPageId) {
          const contributedProjectPageId = block.id;

          try {
            const contributedProjectTree = await getOnePageAsTree(contributedProjectPageId, agent);

            let contributedProjectFileName = contributedProjectPageId;
            let frontmatter = '';

            // Save page tree in file
            // try {
            //   fs.writeFileSync(
            //     path.join(__dirname, `/${contributedProjectFileName}.json`),
            //     JSON.stringify(contributedProjectTree),
            //     { encoding: 'utf-8' },
            //   );
            // } catch (error) {
            //   console.error(`Error while writing file to path "${contributedProjectFileName}.json": `, error);
            // }

            contributedProjectTree.children.forEach((child) => {
              // Frontmatter
              if (child.type === 'collection_inline') {
                frontmatter += '---';
                frontmatter += '\n';

                child.children.forEach((nestedChild) => {
                  frontmatter += `${nestedChild.properties.title[0][0]}: ${nestedChild.properties['uw.c'][0][0]}`;
                  frontmatter += '\n';

                  if (nestedChild.properties.title[0][0] === 'slug') {
                    contributedProjectFileName = nestedChild.properties['uw.c'][0][0];
                  }
                });

                frontmatter += '---';
                frontmatter += '\n';
              }
            });

            try {
              fs.writeFileSync(
                path.join(__dirname, `/content/contributed-projects/${contributedProjectFileName}.md`),
                frontmatter,
                { encoding: 'utf-8' },
              );
            } catch (error) {
              console.error(`Error while writing file to path "/content/contributed-projects/${contributedProjectFileName}.md": `, error);
            }
          } catch (error) {
            console.error('Error while trying to get Notion page tree: ', error);
          }
        }
      });
    } catch (error) {
      console.error('Error while trying to get Notion page blocks: ', error);
    }
  });
};

import path from 'path';
import { GeneratorContext, GeneratorCore } from '@modern-js/codesmith';
import { AppAPI } from '@modern-js/codesmith-api-app';
import { JsonAPI } from '@modern-js/codesmith-api-json';
import {
  i18n as commonI18n,
  GeneratorPluginSchema,
  Solution,
  SolutionGenerator,
  BooleanConfig,
} from '@modern-js/generator-common';
import {
  fs,
  i18n as utilsI18n,
  getAllPackages,
  validatePackagePath,
  validatePackageName,
  getModuleProjectPath,
} from '@modern-js/generator-utils';
import { i18n, localeKeys } from './locale';

const getGeneratorPath = (generator: string, distTag: string) => {
  if (process.env.CODESMITH_ENV === 'development') {
    return path.dirname(require.resolve(generator));
  } else if (distTag) {
    return `${generator}@${distTag}`;
  }
  return generator;
};

const handleTemplateFile = async (
  context: GeneratorContext,
  generator: GeneratorCore,
  appApi: AppAPI,
) => {
  const { outputPath } = generator;

  let packages: string[] = [];

  const {
    isMonorepoSubProject,
    isPublic,
    isLocalPackages,
    projectDir = '',
  } = context.config;

  if (isMonorepoSubProject && !isLocalPackages) {
    try {
      packages = getAllPackages(outputPath);
    } catch (e) {
      generator.logger.debug('get all packages error', e);
      generator.logger.warn(i18n.t(localeKeys.lerna_error));
    }
  }

  const {
    packagePath,
    language,
    packageManager,
    solutionKey,
    solutionName,
    baseSolution,
  } = await appApi.getInputBySchema(
    GeneratorPluginSchema,
    context.config,
    {
      packageName: input =>
        validatePackageName(input as string, packages, {
          isMonorepoSubProject,
        }),
      packagePath: input =>
        validatePackagePath(
          input as string,
          path.join(process.cwd(), projectDir),
          { isPublic },
        ),
    },
    {
      packageName: isMonorepoSubProject ? undefined : path.basename(outputPath),
    },
  );

  await appApi.runSubGenerator(
    getGeneratorPath(
      SolutionGenerator[Solution.Module],
      context.config.distTag,
    ),
    undefined,
    {
      ...context.config,
      isSubGenerator: true,
      needModifyModuleConfig: BooleanConfig.NO,
    },
  );

  const moduleProjectPath = getModuleProjectPath(
    packagePath as string,
    isMonorepoSubProject,
    isPublic,
    isLocalPackages,
  );

  const projectPath = projectDir
    ? path.join(projectDir, moduleProjectPath)
    : moduleProjectPath;

  await appApi.forgeTemplate(
    `templates/${language as string}-template/*`,
    undefined,
    (resourceKey: string) =>
      resourceKey
        .replace(
          `templates/${language as string}-template/`,
          `${path.join(projectPath, 'src')}/`,
        )
        .replace('.handlebars', ''),
    {
      solutionKey,
      solutionName,
      baseSolution,
    },
  );

  const updateInfo = {
    files: ['/templates', '/dist/js/node/main.js'],
    main: './dist/js/node/main.js',
    'scripts.prepare': `${packageManager as string} build && ${
      packageManager as string
    } build:csmith`,
    'scripts.build:csmith': 'csmith-tools build',
    'dependencies.@modern-js/generator-plugin': '^0.0.2',
    'devDependencies.@modern-js/codesmith-tools': '^1.0.0',
  };

  const jsonAPI = new JsonAPI(generator);

  await jsonAPI.update(
    context.materials.default.get(path.join(projectPath, 'package.json')),
    {
      query: {},
      update: { $set: updateInfo },
    },
  );

  await fs.mkdirp(path.join(projectPath, 'templates'));
  const testDir = path.join(projectPath, 'tests');
  fs.rmdirSync(testDir, { recursive: true });
  fs.removeSync(path.join(projectPath, '.npmignore'));
};

export default async (context: GeneratorContext, generator: GeneratorCore) => {
  const appApi = new AppAPI(context, generator);

  const { locale } = context.config;
  i18n.changeLanguage({ locale });
  commonI18n.changeLanguage({ locale });
  utilsI18n.changeLanguage({ locale });
  appApi.i18n.changeLanguage({ locale });

  if (!(await appApi.checkEnvironment())) {
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  }

  generator.logger.debug(`start run @modern-js/generator-plugin-generator`);
  generator.logger.debug(`context=${JSON.stringify(context)}`);
  generator.logger.debug(`context.data=${JSON.stringify(context.data)}`);

  await handleTemplateFile(context, generator, appApi);

  await appApi.runGitAndInstall(context.config.gitCommitMessage);

  appApi.showSuccessInfo();

  generator.logger.debug(
    `forge @modern-js/generator-plugin-generator succeed `,
  );
};

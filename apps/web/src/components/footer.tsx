import { CodeIcon, GithubIcon, LicenceIcon } from './icons.tsx';

const LICENCE_URL =
  'https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service';
const REPO_URL = 'https://github.com/oyedokunken/drift';
const DEVELOPER_URL = 'https://www.oyedokun.dev/';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <p>
          An independent project using TfL open data. Powered by TfL Open Data. Not
          affiliated with Transport for London.
        </p>
        <p>
          Verdicts are automated checks on predictions and can be wrong. Treat them as a
          prompt to look closer.
        </p>
        <nav className="footer__links" aria-label="Project links">
          <a href={LICENCE_URL} target="_blank" rel="noopener noreferrer">
            <LicenceIcon size={20} />
            TfL open data licence
          </a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            <GithubIcon size={20} />
            Source on GitHub
          </a>
          <a href={DEVELOPER_URL} target="_blank" rel="noopener noreferrer">
            <CodeIcon size={20} />
            Developed by @oyedokunken
          </a>
        </nav>
      </div>
    </footer>
  );
}

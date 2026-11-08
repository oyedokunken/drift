import { BackdropMark } from './mark.tsx';

const LICENCE_URL =
  'https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service';
const REPO_URL = 'https://github.com/oyedokunken/drift';

export function Footer() {
  return (
    <footer className="footer">
      <BackdropMark className="footer__mark" />
      <div className="container footer__inner">
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
            TfL open data licence
          </a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            Source on GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}

import { render } from '@testing-library/react';
import Page from '../src/app/page';

describe('Page', () => {
  it('renders the placeholder', () => {
    const { getByRole } = render(<Page />);
    expect(getByRole('heading').textContent).toBe('DAX Stores');
  });
});

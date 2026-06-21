import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import Products from '../Products';

const mockProducts = [
  { id: '1', product_name: 'Kue Cokelat Lumer', price: 10000, description: 'Rasa cokelat premium lumer', shopee_link: 'http://link.a' },
  { id: '2', product_name: 'Korean Custom Cake', price: 20000, description: 'Korean minimalist cake', shopee_link: 'http://link.b' }
];

describe('Products component', () => {
  test('renders products list table', () => {
    const handleRefresh = vi.fn();
    render(<Products products={mockProducts} onRefreshData={handleRefresh} />);

    expect(screen.getByText('Kue Cokelat Lumer')).toBeInTheDocument();
    expect(screen.getByText('Korean Custom Cake')).toBeInTheDocument();
    expect(screen.getByText('Rp 10.000')).toBeInTheDocument();
    expect(screen.getByText('Rp 20.000')).toBeInTheDocument();
  });

  test('filters products based on search input query', () => {
    const handleRefresh = vi.fn();
    render(<Products products={mockProducts} onRefreshData={handleRefresh} />);

    const searchInput = screen.getByPlaceholderText(/Cari nama produk atau deskripsi/i);
    fireEvent.change(searchInput, { target: { value: 'Korean' } });

    expect(screen.getByText('Korean Custom Cake')).toBeInTheDocument();
    expect(screen.queryByText('Kue Cokelat Lumer')).not.toBeInTheDocument();
  });
});

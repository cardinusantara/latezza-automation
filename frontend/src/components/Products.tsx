import { useState } from 'react';
import { 
  IconShoppingCart, 
  IconPlus, 
  IconEdit, 
  IconTrash, 
  IconSearch, 
  IconLoader 
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { API_BASE_URL } from '@/config';

interface Product {
  id: string;
  product_name: string;
  price: number;
  image_url?: string;
  description?: string;
  shopee_link?: string;
}

interface ProductsProps {
  products: Product[];
  onRefreshData: () => void;
}

export default function Products({ products, onRefreshData }: ProductsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dialog Open States
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  
  // Form States
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({
    product_name: '',
    price: '',
    description: '',
    image_url: '',
    shopee_link: ''
  });

  const filteredProducts = products.filter(p => 
    p.product_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const resetForm = () => {
    setForm({
      product_name: '',
      price: '',
      description: '',
      image_url: '',
      shopee_link: ''
    });
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsAddOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setSelectedProduct(product);
    setForm({
      product_name: product.product_name,
      price: String(Math.round(product.price)),
      description: product.description || '',
      image_url: product.image_url || '',
      shopee_link: product.shopee_link || ''
    });
    setIsEditOpen(true);
  };

  const handleOpenDelete = (product: Product) => {
    setSelectedProduct(product);
    setIsDeleteOpen(true);
  };

  // Create Product
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.product_name || !form.price) {
      toast.error('Nama produk dan harga wajib diisi.');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: form.product_name,
          price: parseFloat(form.price),
          description: form.description,
          image_url: form.image_url,
          shopee_link: form.shopee_link
        })
      });
      const data = await res.json();
      if (data.id) {
        toast.success('Produk berhasil ditambahkan.');
        setIsAddOpen(false);
        resetForm();
        onRefreshData();
      } else {
        toast.error('Gagal menambahkan produk: ' + (data.message || 'unknown error'));
      }
    } catch (err) {
      toast.error('Koneksi gagal saat menambahkan produk.');
    } finally {
      setLoading(false);
    }
  };

  // Edit Product
  const handleEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    if (!form.product_name || !form.price) {
      toast.error('Nama produk dan harga wajib diisi.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/products/${selectedProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: form.product_name,
          price: parseFloat(form.price),
          description: form.description,
          image_url: form.image_url,
          shopee_link: form.shopee_link
        })
      });
      const data = await res.json();
      if (data.id) {
        toast.success('Produk berhasil diperbarui.');
        setIsEditOpen(false);
        setSelectedProduct(null);
        resetForm();
        onRefreshData();
      } else {
        toast.error('Gagal memperbarui produk: ' + (data.message || 'unknown error'));
      }
    } catch (err) {
      toast.error('Koneksi gagal saat memperbarui produk.');
    } finally {
      setLoading(false);
    }
  };

  // Delete Product
  const handleDeleteProduct = async () => {
    if (!selectedProduct) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/products/${selectedProduct.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.status === 'success') {
        toast.success('Produk berhasil dihapus.');
        setIsDeleteOpen(false);
        setSelectedProduct(null);
        onRefreshData();
      } else {
        toast.error('Gagal menghapus produk: ' + (data.message || 'unknown error'));
      }
    } catch (err) {
      toast.error('Koneksi gagal saat menghapus produk.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="bg-card border-border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-4 space-y-0">
          <div>
            <CardTitle className="text-lg font-semibold text-foreground">Database Product Catalog</CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-1">
              Kelola katalog produk Latezza secara langsung di database. Data produk ini digunakan oleh AI Agent saat merekomendasikan menu ke kustomer.
            </CardDescription>
          </div>
          <Button 
            onClick={handleOpenAdd}
            className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold gap-1.5 text-xs h-9 px-4"
          >
            <IconPlus size={16} />
            <span>Add Product</span>
          </Button>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {/* Search bar */}
          <div className="relative max-w-sm">
            <IconSearch size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
            <Input 
              type="text" 
              placeholder="Cari nama produk atau deskripsi..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-card/30 border-border text-xs"
            />
          </div>

          {/* Product Table */}
          <div className="overflow-x-auto border border-border/65 rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Image</TableHead>
                  <TableHead className="min-w-[180px]">Product Name</TableHead>
                  <TableHead className="w-[120px]">Price</TableHead>
                  <TableHead className="min-w-[250px]">Description</TableHead>
                  <TableHead className="w-[120px]">Shopee</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      Produk tidak ditemukan atau katalog kosong.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((p) => {
                    const priceStr = 'Rp ' + Math.round(p.price).toLocaleString('id-ID');
                    return (
                      <TableRow key={p.id} className="hover:bg-muted/40">
                        <TableCell>
                          {p.image_url ? (
                            <img 
                              src={p.image_url} 
                              alt={p.product_name} 
                              className="w-10 h-10 object-cover rounded-lg bg-slate-800 border border-border"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="%23374151" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
                              }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-800 border border-border flex items-center justify-center text-muted-foreground">
                              🍰
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold text-foreground">{p.product_name}</TableCell>
                        <TableCell className="font-bold text-emerald-400">{priceStr}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate" title={p.description}>
                          {p.description || '-'}
                        </TableCell>
                        <TableCell>
                          {p.shopee_link ? (
                            <a 
                              href={p.shopee_link} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                            >
                              <IconShoppingCart size={12} />
                              <span>Link</span>
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button 
                              variant="ghost" 
                              size="icon-sm"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => handleOpenEdit(p)}
                            >
                              <IconEdit size={14} />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon-sm"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleOpenDelete(p)}
                            >
                              <IconTrash size={14} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add Product Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add New Product</DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Tambahkan produk baru ke dalam katalog database Latezza Cake.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddProduct} className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Product Name *</label>
              <Input 
                name="product_name" 
                value={form.product_name} 
                onChange={handleChange}
                placeholder="Korean Custom Cake 15cm" 
                required 
                className="bg-card/30 border-border"
              />
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Price (Rupiah) *</label>
              <Input 
                type="number" 
                name="price" 
                value={form.price} 
                onChange={handleChange}
                placeholder="150000" 
                required 
                min="0"
                className="bg-card/30 border-border"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Image URL</label>
              <Input 
                name="image_url" 
                value={form.image_url} 
                onChange={handleChange}
                placeholder="https://example.com/cake.jpg" 
                className="bg-card/30 border-border"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Shopee Link</label>
              <Input 
                name="shopee_link" 
                value={form.shopee_link} 
                onChange={handleChange}
                placeholder="https://shopee.co.id/..." 
                className="bg-card/30 border-border"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Description</label>
              <Textarea 
                name="description" 
                value={form.description} 
                onChange={handleChange}
                placeholder="Korean minimalis cake dengan krim vanilla lembut..." 
                className="bg-card/30 border-border min-h-[80px] text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setIsAddOpen(false)} disabled={loading}>
                Batal
              </Button>
              <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold gap-1.5" disabled={loading}>
                {loading && <IconLoader size={14} className="animate-spin" />}
                <span>Simpan Produk</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Product Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Product Details</DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Perbarui detail produk yang sudah ada di database.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditProduct} className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Product Name *</label>
              <Input 
                name="product_name" 
                value={form.product_name} 
                onChange={handleChange}
                required 
                className="bg-card/30 border-border"
              />
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Price (Rupiah) *</label>
              <Input 
                type="number" 
                name="price" 
                value={form.price} 
                onChange={handleChange}
                required 
                min="0"
                className="bg-card/30 border-border"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Image URL</label>
              <Input 
                name="image_url" 
                value={form.image_url} 
                onChange={handleChange}
                className="bg-card/30 border-border"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Shopee Link</label>
              <Input 
                name="shopee_link" 
                value={form.shopee_link} 
                onChange={handleChange}
                className="bg-card/30 border-border"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Description</label>
              <Textarea 
                name="description" 
                value={form.description} 
                onChange={handleChange}
                className="bg-card/30 border-border min-h-[80px] text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setIsEditOpen(false)} disabled={loading}>
                Batal
              </Button>
              <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold gap-1.5" disabled={loading}>
                {loading && <IconLoader size={14} className="animate-spin" />}
                <span>Simpan Perubahan</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground">Delete Product</DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs leading-relaxed">
              Apakah Anda yakin ingin menghapus produk <strong className="text-foreground">"{selectedProduct?.product_name}"</strong>? Tindakan ini bersifat permanen dan tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 gap-2">
            <Button type="button" variant="ghost" onClick={() => setIsDeleteOpen(false)} disabled={loading}>
              Batal
            </Button>
            <Button type="button" variant="destructive" onClick={handleDeleteProduct} className="font-semibold gap-1.5" disabled={loading}>
              {loading && <IconLoader size={14} className="animate-spin" />}
              <span>Hapus Produk</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { db } from './firebaseConfig';
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc,
  query,
  orderBy,
  Timestamp 
} from 'firebase/firestore';
import { UserInputs, Product } from './types';

export interface SavedOrder {
  id?: string;
  name: string;
  inputs: UserInputs;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

const ORDERS_COLLECTION = 'orders';
const PRODUCTS_COLLECTION = 'products';

// Helper function to remove undefined values from objects (Firestore doesn't support undefined)
const removeUndefined = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return null;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefined(item));
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const key in obj) {
      if (obj[key] !== undefined) {
        cleaned[key] = removeUndefined(obj[key]);
      }
    }
    return cleaned;
  }
  return obj;
};

// Save a new order
export const saveOrder = async (name: string, inputs: UserInputs): Promise<string> => {
  try {
    const orderData: Omit<SavedOrder, 'id'> = {
      name,
      inputs: removeUndefined(inputs) as UserInputs,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    
    const docRef = await addDoc(collection(db, ORDERS_COLLECTION), removeUndefined(orderData));
    return docRef.id;
  } catch (error: any) {
    console.error('Error saving order:', error);
    throw new Error(`שגיאה בשמירה: ${error?.message || 'שגיאה לא ידועה'}`);
  }
};

// Get all saved orders
export const getAllOrders = async (): Promise<SavedOrder[]> => {
  try {
    const q = query(collection(db, ORDERS_COLLECTION), orderBy('updatedAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as SavedOrder[];
  } catch (error) {
    console.error('Error getting orders:', error);
    throw error;
  }
};

// Update an existing order
export const updateOrder = async (orderId: string, name: string, inputs: UserInputs): Promise<void> => {
  try {
    const orderRef = doc(db, ORDERS_COLLECTION, orderId);
    await updateDoc(orderRef, removeUndefined({
      name,
      inputs: removeUndefined(inputs) as UserInputs,
      updatedAt: Timestamp.now(),
    }));
  } catch (error) {
    console.error('Error updating order:', error);
    throw error;
  }
};

// Delete an order
export const deleteOrder = async (orderId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, ORDERS_COLLECTION, orderId));
  } catch (error) {
    console.error('Error deleting order:', error);
    throw error;
  }
};

// Save products to Firestore (global products)
export const saveProducts = async (products: Product[]): Promise<string> => {
  try {
    const productsData = {
      products: removeUndefined(products),
      updatedAt: Timestamp.now(),
    };
    
    const docRef = await addDoc(collection(db, PRODUCTS_COLLECTION), removeUndefined(productsData));
    return docRef.id;
  } catch (error: any) {
    console.error('Error saving products:', error);
    throw new Error(`שגיאה בשמירת המוצרים: ${error?.message || 'שגיאה לא ידועה'}`);
  }
};

// Get saved products from Firestore (get the most recent)
export const getSavedProducts = async (): Promise<Product[]> => {
  try {
    const q = query(collection(db, PRODUCTS_COLLECTION), orderBy('updatedAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return [];
    }
    
    // Get the most recent products document
    const latestDoc = querySnapshot.docs[0];
    const data = latestDoc.data();
    const products = data.products || [];
    
    // Ensure all products have active field (default to true if not set)
    return products.map((product: Product) => ({
      ...product,
      active: product.active !== undefined ? product.active : true
    }));
  } catch (error) {
    console.error('Error getting products:', error);
    throw error;
  }
};

